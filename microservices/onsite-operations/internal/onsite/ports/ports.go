package ports

import (
	"context"
	"nexo-onsite-operations/internal/onsite/domain"
	"time"
)

type Claims struct{ ActorID, TenantID, Role, DeviceID, TraceID string }
type AttendancePage struct {
	Items      []domain.AttendanceFact
	NextCursor *string
}
type Clock interface{ Now() time.Time }
type TicketRepository interface {
	Search(context.Context, string, string, string, string) ([]domain.Ticket, error)
}
type AttendanceRepository interface {
	CheckIn(context.Context, domain.AttendanceFact, string, Claims, string) (domain.AttendanceFact, error)
	List(context.Context, string, string, string, string, int) (AttendancePage, error)
	Dashboard(context.Context, string, string) (map[string]any, error)
}
