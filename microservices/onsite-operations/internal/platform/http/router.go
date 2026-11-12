package http

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"nexo-onsite-operations/internal/onsite/application"
	"nexo-onsite-operations/internal/onsite/domain"
	"nexo-onsite-operations/internal/onsite/ports"
	"nexo-onsite-operations/internal/platform/postgres"
)

type Router struct {
	App     *fiber.App
	Service application.Service
	DB      *postgres.Store
}

func NewRouter(db *postgres.Store) *Router {
	r := &Router{App: fiber.New(fiber.Config{AppName: "Nexo Onsite Operations", BodyLimit: 1 << 20}), DB: db, Service: application.Service{Tickets: db, Attendance: db}}
	r.routes()
	return r
}
func (r *Router) trace(c fiber.Ctx) string {
	id := c.Get("X-Request-Id")
	if _, err := uuid.Parse(id); err != nil {
		id = uuid.NewString()
	}
	c.Set("X-Request-Id", id)
	c.Locals("trace_id", id)
	return id
}
func traceID(c fiber.Ctx) string {
	if id, ok := c.Locals("trace_id").(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-Id")
}
func problem(c fiber.Ctx, status int, code, detail string) error {
	id := traceID(c)
	return c.Status(status).Type("application/problem+json").JSON(fiber.Map{"type": "https://errors.example.pe/" + code, "title": code, "status": status, "code": code, "detail": detail, "trace_id": id})
}
func (r *Router) auth(scope string) fiber.Handler {
	return func(c fiber.Ctx) error {
		env := os.Getenv("APP_ENV")
		if env == "" {
			env = "development"
		}
		role := c.Get("X-Mock-Role")
		actor := c.Get("X-Mock-Actor")
		tenant := c.Get("X-Mock-Tenant")
		device := c.Get("X-Mock-Device")
		if env != "development" && env != "test" && (role != "" || actor != "" || tenant != "" || device != "") {
			return problem(c, 401, "unauthorized", "mock claims are disabled")
		}
		if env != "development" && env != "test" && c.Get("Authorization") == "" {
			return problem(c, 401, "unauthorized", "Authorization es obligatorio")
		}
		if role == "" {
			role = "staff"
		}
		if actor == "" {
			actor = "00000000-0000-0000-0000-000000000004"
		}
		if tenant == "" {
			tenant = "00000000-0000-0000-0000-000000000001"
		}
		if device == "" {
			device = "00000000-0000-0000-0000-000000000103"
		}
		if scope == "onsite:read" && role != "staff" && role != "supervisor" && role != "manager" {
			return problem(c, 403, "assignment_forbidden", "rol sin permiso")
		}
		if scope == "onsite:checkin" && role != "staff" && role != "supervisor" && role != "manager" {
			return problem(c, 403, "assignment_forbidden", "rol sin permiso")
		}
		c.Locals("claims", ports.Claims{ActorID: actor, TenantID: tenant, Role: role, DeviceID: device, TraceID: traceID(c)})
		return c.Next()
	}
}
func claims(c fiber.Ctx) ports.Claims { v, _ := c.Locals("claims").(ports.Claims); return v }
func (r *Router) ensureAssignment(c fiber.Ctx, event, scope string) error {
	ok, err := r.DB.ValidAssignment(c.Context(), claims(c), event, scope)
	if err != nil {
		return problem(c, 503, "persistence_unavailable", "no se pudo validar la asignación")
	}
	if !ok {
		return problem(c, 403, "assignment_forbidden", "el operador no tiene una asignación vigente")
	}
	return nil
}
func (r *Router) routes() {
	a := r.App
	a.Use(func(c fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, X-Mock-Role, X-Mock-Actor, X-Mock-Tenant, X-Mock-Device, X-Request-Id")
		c.Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if c.Method() == "OPTIONS" {
			return c.SendStatus(204)
		}
		r.trace(c)
		return c.Next()
	})
	a.Get("/health/live", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	a.Get("/health/ready", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := r.DB.Ready(ctx); err != nil {
			return problem(c, 503, "database_unavailable", "base de datos no disponible")
		}
		return c.JSON(fiber.Map{"status": "ok", "database": "ready"})
	})
	a.Get("/onsite/v1/readiness", r.auth("onsite:checkin"), r.readiness)
	a.Get("/onsite/v1/tickets/search", r.auth("onsite:checkin"), r.search)
	a.Post("/onsite/v1/attendance/check-ins", r.auth("onsite:checkin"), r.checkIn)
	a.Get("/onsite/v1/attendance", r.auth("onsite:read"), r.list)
	a.Get("/onsite/v1/dashboard", r.auth("onsite:read"), r.dashboard)
}
func (r *Router) readiness(c fiber.Ctx) error {
	if c.Query("event_id") == "" || c.Query("scope") == "" {
		return problem(c, 422, "invalid_scope", "event_id y scope son obligatorios")
	}
	if err := r.ensureAssignment(c, c.Query("event_id"), c.Query("scope")); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ready": true, "event_id": c.Query("event_id"), "scope": c.Query("scope"), "device_id": claims(c).DeviceID})
}
func (r *Router) search(c fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	if !domain.ValidQuery(q) {
		return problem(c, 400, "invalid_query", "q requiere al menos 4 caracteres")
	}
	if c.Query("event_id") == "" || c.Query("scope") == "" {
		return problem(c, 400, "invalid_scope", "event_id y scope son obligatorios")
	}
	if err := r.ensureAssignment(c, c.Query("event_id"), c.Query("scope")); err != nil {
		return err
	}
	items, err := r.Service.Search(c.Context(), q, c.Query("event_id"), c.Query("scope"), claims(c).TenantID)
	if err != nil {
		return problem(c, 503, "persistence_unavailable", "no se pudo buscar")
	}
	out := make([]fiber.Map, 0, len(items))
	for _, t := range items {
		out = append(out, fiber.Map{"ticket_id": t.ID, "masked_holder": t.MaskedHolder, "status": t.Status})
	}
	return c.JSON(out)
}
func (r *Router) checkIn(c fiber.Ctx) error {
	var b struct {
		TicketID string `json:"ticket_id"`
		EventID  string `json:"event_id"`
		Scope    string `json:"scope"`
	}
	if err := json.Unmarshal(c.Body(), &b); err != nil {
		return problem(c, 400, "invalid_body", "JSON inválido")
	}
	if b.TicketID == "" || b.EventID == "" || b.Scope == "" {
		return problem(c, 400, "invalid_body", "ticket_id, event_id y scope son obligatorios")
	}
	if err := r.ensureAssignment(c, b.EventID, b.Scope); err != nil {
		return err
	}
	key := strings.TrimSpace(c.Get("Idempotency-Key"))
	if _, err := uuid.Parse(key); err != nil {
		return problem(c, 400, "idempotency_key_required", "Idempotency-Key debe ser UUID")
	}
	hash := sha256.Sum256(c.Body())
	fact, err := r.Service.CheckIn(c.Context(), domain.AttendanceFact{TicketID: b.TicketID, EventID: b.EventID, Scope: b.Scope}, hex.EncodeToString(hash[:]), claims(c), key)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrAlreadyPresent):
			return problem(c, 409, "already_present", "el ticket ya tiene presencia efectiva")
		case errors.Is(err, domain.ErrIdempotencyKeyReused):
			return problem(c, 409, "idempotency_key_reused", "la clave fue usada con otro body")
		case errors.Is(err, domain.ErrIdempotencyKeyRequired):
			return problem(c, 400, "idempotency_key_required", "Idempotency-Key es obligatorio")
		default:
			return problem(c, 422, err.Error(), err.Error())
		}
	}
	return c.Status(201).JSON(fiber.Map{"id": fact.ID, "ticket_id": fact.TicketID, "event_id": fact.EventID, "scope": fact.Scope, "type": fact.Type, "occurred_at": fact.OccurredAt, "effective_status": fact.EffectiveStatus})
}
func (r *Router) list(c fiber.Ctx) error {
	if c.Query("event_id") == "" || c.Query("scope") == "" {
		return problem(c, 400, "invalid_scope", "event_id y scope son obligatorios")
	}
	if err := r.ensureAssignment(c, c.Query("event_id"), c.Query("scope")); err != nil {
		return err
	}
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			return problem(c, 400, "invalid_limit", "limit debe estar entre 1 y 100")
		}
		limit = parsed
	}
	cursor := strings.TrimSpace(c.Query("cursor"))
	if cursor != "" {
		if _, err := time.Parse(time.RFC3339Nano, cursor); err != nil {
			return problem(c, 400, "invalid_cursor", "cursor debe ser una fecha RFC3339")
		}
	}
	page, err := r.Service.List(c.Context(), c.Query("event_id"), c.Query("scope"), claims(c).TenantID, cursor, limit)
	if err != nil {
		return problem(c, 503, "persistence_unavailable", "no se pudo consultar historial")
	}
	items := make([]fiber.Map, 0, len(page.Items))
	for _, fact := range page.Items {
		items = append(items, fiber.Map{
			"id":                  fact.ID,
			"ticket_id":           fact.TicketID,
			"event_id":            fact.EventID,
			"scope":               fact.Scope,
			"type":                fact.Type,
			"actor_id":            fact.ActorID,
			"device_id":           fact.DeviceID,
			"occurred_at":         fact.OccurredAt,
			"reason":              fact.Reason,
			"compensates_fact_id": fact.CompensatesFactID,
			"effective_status":    fact.EffectiveStatus,
		})
	}
	return c.JSON(fiber.Map{"items": items, "next_cursor": page.NextCursor})
}
func (r *Router) dashboard(c fiber.Ctx) error {
	event := c.Query("event_id")
	if event == "" {
		return problem(c, 400, "invalid_event", "event_id es obligatorio")
	}
	if err := r.ensureAssignment(c, event, "main"); err != nil {
		return err
	}
	data, err := r.Service.Dashboard(c.Context(), event, claims(c).TenantID)
	if err != nil {
		return problem(c, 503, "persistence_unavailable", "no se pudo consultar dashboard")
	}
	return c.JSON(data)
}

var _ = fmt.Sprintf
