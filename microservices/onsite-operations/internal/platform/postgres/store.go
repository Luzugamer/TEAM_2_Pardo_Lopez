package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"nexo-onsite-operations/internal/onsite/domain"
	"nexo-onsite-operations/internal/onsite/ports"
)

type Store struct{ Pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{Pool: pool} }
func (s *Store) ValidAssignment(ctx context.Context, c ports.Claims, event, scope string) (bool, error) {
	var exists bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM onsite.operator_assignments a JOIN onsite.events e ON e.id=a.event_id JOIN onsite.scopes sc ON sc.id=a.scope_id JOIN onsite.devices d ON d.id=a.device_id WHERE a.user_id=$1 AND e.tenant_id=$2 AND e.source_event_id=$3 AND sc.code=$4 AND a.role=$5 AND d.id=$6 AND d.status='active' AND now() BETWEEN a.valid_from AND a.valid_until)`, c.ActorID, c.TenantID, event, scope, c.Role, c.DeviceID).Scan(&exists)
	return exists, err
}
func (s *Store) Search(ctx context.Context, q, event, scope, tenant string) ([]domain.Ticket, error) {
	rows, err := s.Pool.Query(ctx, `SELECT t.ticket_id,e.source_event_id,s.code,t.status,t.expires_at,t.masked_holder,t.search_code FROM onsite.ticket_projections t JOIN onsite.events e ON e.id=t.event_id JOIN onsite.scopes s ON s.id=t.scope_id WHERE e.tenant_id=$1 AND e.source_event_id=$2 AND s.code=$3 AND t.search_code=$4 LIMIT 5`, tenant, event, scope, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.Ticket, 0, 5)
	for rows.Next() {
		var t domain.Ticket
		if err := rows.Scan(&t.ID, &t.EventID, &t.Scope, &t.Status, &t.ExpiresAt, &t.MaskedHolder, &t.SearchCode); err != nil {
			return nil, err
		}
		items = append(items, t)
	}
	return items, rows.Err()
}
func hashBody(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
func (s *Store) CheckIn(ctx context.Context, fact domain.AttendanceFact, bodyHash string, c ports.Claims, key string) (domain.AttendanceFact, error) {
	if strings.TrimSpace(key) == "" {
		return domain.AttendanceFact{}, domain.ErrIdempotencyKeyRequired
	}
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.AttendanceFact{}, err
	}
	defer tx.Rollback(ctx)
	var oldHash string
	var oldStatus int
	var oldBody []byte
	err = tx.QueryRow(ctx, `SELECT request_hash,status_code,response_body FROM onsite.idempotency_records WHERE key=$1 AND actor_id=$2 FOR UPDATE`, key, c.ActorID).Scan(&oldHash, &oldStatus, &oldBody)
	if err == nil {
		if oldHash != bodyHash {
			return domain.AttendanceFact{}, domain.ErrIdempotencyKeyReused
		}
		if err := json.Unmarshal(oldBody, &fact); err != nil {
			return domain.AttendanceFact{}, err
		}
		return fact, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.AttendanceFact{}, err
	}
	var status, eventID, scope string
	var expires time.Time
	err = tx.QueryRow(ctx, `SELECT t.status,e.source_event_id,s.code,t.expires_at FROM onsite.ticket_projections t JOIN onsite.events e ON e.id=t.event_id JOIN onsite.scopes s ON s.id=t.scope_id WHERE t.ticket_id=$1 FOR SHARE`, fact.TicketID).Scan(&status, &eventID, &scope, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AttendanceFact{}, errors.New("ticket_invalid")
	}
	if err != nil {
		return domain.AttendanceFact{}, err
	}
	if reason := (domain.Ticket{ID: fact.TicketID, EventID: eventID, Scope: scope, Status: status, ExpiresAt: expires}).Validate(fact.EventID, fact.Scope, time.Now().UTC()); reason != "" {
		return domain.AttendanceFact{}, errors.New(reason)
	}
	fact.ID = uuid.NewString()
	fact.Type = "check_in"
	fact.OccurredAt = time.Now().UTC()
	fact.EffectiveStatus = "present"
	var eventUUID, scopeUUID string
	if err = tx.QueryRow(ctx, `SELECT e.id::text,s.id::text FROM onsite.events e JOIN onsite.scopes s ON s.event_id=e.id WHERE e.source_event_id=$1 AND s.code=$2`, fact.EventID, fact.Scope).Scan(&eventUUID, &scopeUUID); err != nil {
		return domain.AttendanceFact{}, errors.New("wrong_scope")
	}
	_, err = tx.Exec(ctx, `INSERT INTO onsite.attendance_facts(id,ticket_id,event_id,scope_id,type,actor_id,device_id,occurred_at) VALUES($1,$2,$3::uuid,$4::uuid,$5,$6::uuid,$7::uuid,$8)`, fact.ID, fact.TicketID, eventUUID, scopeUUID, fact.Type, c.ActorID, c.DeviceID, fact.OccurredAt)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			return domain.AttendanceFact{}, domain.ErrAlreadyPresent
		}
		return domain.AttendanceFact{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO onsite.effective_attendance(ticket_id,event_id,scope_id,check_in_fact_id,checked_in_at) VALUES($1,$2::uuid,$3::uuid,$4,$5)`, fact.TicketID, eventUUID, scopeUUID, fact.ID, fact.OccurredAt)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			return domain.AttendanceFact{}, domain.ErrAlreadyPresent
		}
		return domain.AttendanceFact{}, err
	}
	body, _ := json.Marshal(fact)
	if _, err = tx.Exec(ctx, `INSERT INTO onsite.idempotency_records(key,actor_id,request_hash,status_code,response_body) VALUES($1,$2,$3,$4,$5)`, key, c.ActorID, bodyHash, 201, body); err != nil {
		return domain.AttendanceFact{}, err
	}
	meta := map[string]any{"ticket_id": fact.TicketID, "scope": fact.Scope}
	metaJSON, _ := json.Marshal(meta)
	_, err = tx.Exec(ctx, `INSERT INTO onsite.audit_log(id,tenant_id,actor_id,action,resource_type,resource_id,trace_id,metadata) VALUES($1,$2,$3,'attendance.check_in','attendance_fact',$4,$5,$6)`, uuid.NewString(), c.TenantID, c.ActorID, fact.ID, c.TraceID, metaJSON)
	if err != nil {
		return domain.AttendanceFact{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.AttendanceFact{}, err
	}
	return fact, nil
}
func (s *Store) List(ctx context.Context, event, scope, tenant, cursor string, limit int) (ports.AttendancePage, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx, `SELECT f.id,f.ticket_id,e.source_event_id,s.code,f.type,f.actor_id,f.device_id,f.occurred_at,COALESCE(f.reason,''),COALESCE(f.compensates_fact_id::text,''),CASE WHEN EXISTS(SELECT 1 FROM onsite.effective_attendance x WHERE x.check_in_fact_id=f.id) THEN 'present' ELSE 'recorded' END FROM onsite.attendance_facts f JOIN onsite.events e ON e.id=f.event_id JOIN onsite.scopes s ON s.id=f.scope_id WHERE e.tenant_id=$1 AND e.source_event_id=$2 AND s.code=$3 AND ($4='' OR f.occurred_at < $4::timestamptz) ORDER BY f.occurred_at DESC LIMIT $5`, tenant, event, scope, cursor, limit+1)
	if err != nil {
		return ports.AttendancePage{}, err
	}
	defer rows.Close()
	out := []domain.AttendanceFact{}
	hasMore := false
	for rows.Next() {
		if len(out) == limit {
			hasMore = true
			break
		}
		var f domain.AttendanceFact
		if err := rows.Scan(&f.ID, &f.TicketID, &f.EventID, &f.Scope, &f.Type, &f.ActorID, &f.DeviceID, &f.OccurredAt, &f.Reason, &f.CompensatesFactID, &f.EffectiveStatus); err != nil {
			return ports.AttendancePage{}, err
		}
		out = append(out, f)
	}
	if err := rows.Err(); err != nil {
		return ports.AttendancePage{}, err
	}
	page := ports.AttendancePage{Items: out}
	if hasMore {
		cursor := out[len(out)-1].OccurredAt.UTC().Format(time.RFC3339Nano)
		page.NextCursor = &cursor
	}
	return page, nil
}
func (s *Store) Dashboard(ctx context.Context, event, tenant string) (map[string]any, error) {
	var registered, confirmed, present int
	err := s.Pool.QueryRow(ctx, `SELECT COUNT(*),COUNT(*) FILTER(WHERE t.status='active'),(SELECT COUNT(*) FROM onsite.effective_attendance x JOIN onsite.events ex ON ex.id=x.event_id WHERE ex.tenant_id=$1 AND ex.source_event_id=$2) FROM onsite.ticket_projections t JOIN onsite.events e ON e.id=t.event_id WHERE e.tenant_id=$1 AND e.source_event_id=$2`, tenant, event).Scan(&registered, &confirmed, &present)
	if err != nil {
		return nil, err
	}
	rate := 0.0
	if confirmed > 0 {
		rate = float64(present) / float64(confirmed) * 100
	}
	return map[string]any{"registered": registered, "confirmed": confirmed, "present": present, "attendance_rate": rate}, nil
}
func (s *Store) Ready(ctx context.Context) error { return s.Pool.Ping(ctx) }
func BodyHash(v any) (string, error)             { return hashBody(v) }

var _ = fmt.Sprintf
