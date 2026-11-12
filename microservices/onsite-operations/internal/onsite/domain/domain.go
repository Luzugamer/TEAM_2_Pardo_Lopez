package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrAlreadyPresent         = errors.New("already_present")
	ErrIdempotencyKeyRequired = errors.New("idempotency_key_required")
	ErrIdempotencyKeyReused   = errors.New("idempotency_key_reused")
)

type Ticket struct {
	ID, EventID, Scope, Status, MaskedHolder, SearchCode string
	ExpiresAt                                            time.Time
}

type AttendanceFact struct {
	ID, TicketID, EventID, Scope, Type, ActorID, DeviceID, Reason, CompensatesFactID string
	OccurredAt                                                                       time.Time
	EffectiveStatus                                                                  string
}

func (t Ticket) Validate(event, scope string, now time.Time) string {
	if t.EventID != event {
		return "wrong_event"
	}
	if t.Scope != scope {
		return "wrong_scope"
	}
	if t.Status == "revoked" {
		return "ticket_revoked"
	}
	if t.Status == "expired" || (!t.ExpiresAt.IsZero() && !now.Before(t.ExpiresAt)) {
		return "ticket_expired"
	}
	if t.Status != "active" {
		return "ticket_invalid"
	}
	return ""
}

func ValidQuery(q string) bool { return len([]rune(strings.TrimSpace(q))) >= 4 }
