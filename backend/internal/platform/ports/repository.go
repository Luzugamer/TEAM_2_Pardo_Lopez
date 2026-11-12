package ports

import (
	"context"
	"errors"
	"time"

	auth "nexo-backend/internal/auth/domain"
	tenant "nexo-backend/internal/tenant/domain"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("conflict")

type Repository interface {
	CreateUser(context.Context, auth.User) error
	FindUserByEmail(context.Context, string) (auth.User, error)
	FindUser(context.Context, string) (auth.User, error)
	CreateSession(context.Context, auth.Session) error
	FindSession(context.Context, string) (auth.Session, error)
	FindSessionByRefreshHash(context.Context, []byte) (auth.Session, error)
	RevokeSession(context.Context, string, time.Time) error
	ListTenants(context.Context, string) ([]tenant.Tenant, error)
	CreateTenant(context.Context, tenant.Tenant, tenant.Membership) error
	MembershipRole(context.Context, string, string) (string, error)
}
