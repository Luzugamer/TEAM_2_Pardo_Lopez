package memory

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	auth "nexo-backend/internal/auth/domain"
	"nexo-backend/internal/platform/ports"
	tenant "nexo-backend/internal/tenant/domain"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	Mu          sync.RWMutex
	Users       map[string]auth.User
	UsersByMail map[string]string
	Tenants     map[string]tenant.Tenant
	Memberships []tenant.Membership
	Sessions    map[string]auth.Session
}

func NewStore() *Store {
	return &Store{Users: map[string]auth.User{}, UsersByMail: map[string]string{}, Tenants: map[string]tenant.Tenant{}, Sessions: map[string]auth.Session{}}
}

func (s *Store) findUserByEmail(email string) (auth.User, bool) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	id, ok := s.UsersByMail[strings.ToLower(strings.TrimSpace(email))]
	if !ok {
		return auth.User{}, false
	}
	u, ok := s.Users[id]
	return u, ok
}

func (s *Store) userTenants(userID string) []tenant.Tenant {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	ids := map[string]bool{}
	for _, membership := range s.Memberships {
		if membership.UserID == userID {
			ids[membership.TenantID] = true
		}
	}
	result := make([]tenant.Tenant, 0, len(ids))
	for id := range ids {
		if item, ok := s.Tenants[id]; ok {
			result = append(result, item)
		}
	}
	return result
}

func (s *Store) userMemberships(userID, tenantID string) []tenant.Membership {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	result := []tenant.Membership{}
	for _, item := range s.Memberships {
		if item.UserID == userID && item.TenantID == tenantID {
			result = append(result, item)
		}
	}
	return result
}

func (s *Store) CreateUser(_ context.Context, user auth.User) error {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	if _, ok := s.UsersByMail[user.Email]; ok {
		return ports.ErrConflict
	}
	s.Users[user.ID] = user
	s.UsersByMail[user.Email] = user.ID
	return nil
}
func (s *Store) FindUserByEmail(_ context.Context, email string) (auth.User, error) {
	user, ok := s.findUserByEmail(email)
	if !ok {
		return auth.User{}, ports.ErrNotFound
	}
	return user, nil
}
func (s *Store) FindUser(_ context.Context, id string) (auth.User, error) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	user, ok := s.Users[id]
	if !ok {
		return auth.User{}, ports.ErrNotFound
	}
	return user, nil
}
func (s *Store) CreateSession(_ context.Context, session auth.Session) error {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	s.Sessions[session.ID] = session
	return nil
}
func (s *Store) FindSession(_ context.Context, id string) (auth.Session, error) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	session, ok := s.Sessions[id]
	if !ok {
		return auth.Session{}, ports.ErrNotFound
	}
	return session, nil
}
func (s *Store) FindSessionByRefreshHash(_ context.Context, refreshHash []byte) (auth.Session, error) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	for _, session := range s.Sessions {
		if string(session.RefreshHash) == string(refreshHash) {
			return session, nil
		}
	}
	return auth.Session{}, ports.ErrNotFound
}
func (s *Store) RevokeSession(_ context.Context, id string, at time.Time) error {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	session, ok := s.Sessions[id]
	if !ok {
		return ports.ErrNotFound
	}
	session.RevokedAt = &at
	s.Sessions[id] = session
	return nil
}
func (s *Store) ListTenants(_ context.Context, userID string) ([]tenant.Tenant, error) {
	return s.userTenants(userID), nil
}
func (s *Store) CreateTenant(_ context.Context, item tenant.Tenant, membership tenant.Membership) error {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	for _, current := range s.Tenants {
		if current.Slug == item.Slug {
			return ports.ErrConflict
		}
	}
	s.Tenants[item.ID] = item
	s.Memberships = append(s.Memberships, membership)
	return nil
}
func (s *Store) MembershipRole(_ context.Context, userID, tenantID string) (string, error) {
	items := s.userMemberships(userID, tenantID)
	if len(items) == 0 {
		return "", ports.ErrNotFound
	}
	return items[0].Role, nil
}
