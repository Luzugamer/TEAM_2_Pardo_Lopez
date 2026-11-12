package domain

import (
	"testing"
	"time"
)

func TestTicketValidate(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name, status, event, scope string
		expires                    time.Time
		want                       string
	}{{"wrong event", "active", "other", "main", now, "wrong_event"}, {"wrong scope", "active", "event", "other", now, "wrong_scope"}, {"revoked", "revoked", "event", "main", now, "ticket_revoked"}, {"expired", "active", "event", "main", now.Add(-time.Minute), "ticket_expired"}, {"valid", "active", "event", "main", now.Add(time.Minute), ""}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := (Ticket{EventID: "event", Scope: "main", Status: tc.status, ExpiresAt: tc.expires}).Validate(tc.event, tc.scope, now)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
func TestValidQuery(t *testing.T) {
	if ValidQuery("abc") {
		t.Fatal("short query accepted")
	}
	if !ValidQuery("DEMO-2026-001") {
		t.Fatal("exact ticket rejected")
	}
}
