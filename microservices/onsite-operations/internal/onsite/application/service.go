package application

import (
	"context"
	"nexo-onsite-operations/internal/onsite/domain"
	"nexo-onsite-operations/internal/onsite/ports"
)

type Service struct {
	Tickets    ports.TicketRepository
	Attendance ports.AttendanceRepository
}

func (s Service) Search(ctx context.Context, q, event, scope, tenant string) ([]domain.Ticket, error) {
	return s.Tickets.Search(ctx, q, event, scope, tenant)
}
func (s Service) CheckIn(ctx context.Context, fact domain.AttendanceFact, bodyHash string, claims ports.Claims, key string) (domain.AttendanceFact, error) {
	return s.Attendance.CheckIn(ctx, fact, bodyHash, claims, key)
}
func (s Service) List(ctx context.Context, event, scope, tenant, cursor string, limit int) (ports.AttendancePage, error) {
	return s.Attendance.List(ctx, event, scope, tenant, cursor, limit)
}
func (s Service) Dashboard(ctx context.Context, event, tenant string) (map[string]any, error) {
	return s.Attendance.Dashboard(ctx, event, tenant)
}
