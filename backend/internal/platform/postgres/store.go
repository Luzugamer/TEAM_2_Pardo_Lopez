package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	auth "nexo-backend/internal/auth/domain"
	"nexo-backend/internal/platform/ports"
	tenant "nexo-backend/internal/tenant/domain"
)

type Store struct{ DB *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{DB: db} }
func mapError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ports.ErrConflict
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ports.ErrNotFound
	}
	return err
}
func (s *Store) CreateUser(ctx context.Context, user auth.User) error {
	_, err := s.DB.Exec(ctx, `INSERT INTO identity.users(id,email,display_name,password_hash,active,created_at) VALUES($1,$2,$3,$4,$5,$6)`, user.ID, user.Email, user.Name, user.PasswordHash, user.Active, user.CreatedAt)
	return mapError(err)
}
func (s *Store) FindUserByEmail(ctx context.Context, email string) (auth.User, error) {
	var user auth.User
	err := s.DB.QueryRow(ctx, `SELECT id::text,email,display_name,password_hash,active,created_at FROM identity.users WHERE email=lower($1)`, email).Scan(&user.ID, &user.Email, &user.Name, &user.PasswordHash, &user.Active, &user.CreatedAt)
	return user, mapError(err)
}
func (s *Store) FindUser(ctx context.Context, id string) (auth.User, error) {
	var user auth.User
	err := s.DB.QueryRow(ctx, `SELECT id::text,email,display_name,password_hash,active,created_at FROM identity.users WHERE id=$1`, id).Scan(&user.ID, &user.Email, &user.Name, &user.PasswordHash, &user.Active, &user.CreatedAt)
	return user, mapError(err)
}
func (s *Store) CreateSession(ctx context.Context, session auth.Session) error {
	_, err := s.DB.Exec(ctx, `INSERT INTO identity.sessions(id,user_id,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at) VALUES($1,$2,$3,$4,$5,$6)`, session.ID, session.UserID, session.AccessHash, session.RefreshHash, session.ExpiresAt, session.RefreshUntil)
	return mapError(err)
}
func (s *Store) FindSession(ctx context.Context, id string) (auth.Session, error) {
	var item auth.Session
	err := s.DB.QueryRow(ctx, `SELECT id::text,user_id::text,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at,revoked_at FROM identity.sessions WHERE id=$1`, id).Scan(&item.ID, &item.UserID, &item.AccessHash, &item.RefreshHash, &item.ExpiresAt, &item.RefreshUntil, &item.RevokedAt)
	return item, mapError(err)
}
func (s *Store) FindSessionByRefreshHash(ctx context.Context, hash []byte) (auth.Session, error) {
	var item auth.Session
	err := s.DB.QueryRow(ctx, `SELECT id::text,user_id::text,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at,revoked_at FROM identity.sessions WHERE refresh_token_hash=$1`, hash).Scan(&item.ID, &item.UserID, &item.AccessHash, &item.RefreshHash, &item.ExpiresAt, &item.RefreshUntil, &item.RevokedAt)
	return item, mapError(err)
}
func (s *Store) RevokeSession(ctx context.Context, id string, at time.Time) error {
	result, err := s.DB.Exec(ctx, `UPDATE identity.sessions SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL`, id, at)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ports.ErrNotFound
	}
	return nil
}
func (s *Store) ListTenants(ctx context.Context, userID string) ([]tenant.Tenant, error) {
	rows, err := s.DB.Query(ctx, `SELECT t.id::text,t.name,t.slug,t.created_at FROM identity.tenants t JOIN identity.memberships m ON m.tenant_id=t.id WHERE m.user_id=$1 AND m.active ORDER BY t.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []tenant.Tenant{}
	for rows.Next() {
		var item tenant.Tenant
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Store) CreateTenant(ctx context.Context, item tenant.Tenant, membership tenant.Membership) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO identity.tenants(id,name,slug,created_at) VALUES($1,$2,$3,$4)`, item.ID, item.Name, item.Slug, item.CreatedAt); err != nil {
		return mapError(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity.memberships(user_id,tenant_id,role,active) VALUES($1,$2,$3,true)`, membership.UserID, membership.TenantID, membership.Role); err != nil {
		return mapError(err)
	}
	return mapError(tx.Commit(ctx))
}
func (s *Store) MembershipRole(ctx context.Context, userID, tenantID string) (string, error) {
	var role string
	err := s.DB.QueryRow(ctx, `SELECT role FROM identity.memberships WHERE user_id=$1 AND tenant_id=$2 AND active`, userID, tenantID).Scan(&role)
	return role, mapError(err)
}
