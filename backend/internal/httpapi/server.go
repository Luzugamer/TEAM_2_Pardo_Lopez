package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	auth "nexo-backend/internal/auth/domain"
	"nexo-backend/internal/platform/ports"
	tenant "nexo-backend/internal/tenant/domain"
)

type Server struct {
	Repo   ports.Repository
	Secret string
}
type contextKey string

const claimsKey contextKey = "nexo.claims"

type registerRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}
type tenantRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func NewServer(repo ports.Repository) *Server {
	secret := os.Getenv("NEXO_JWT_SECRET")
	if secret == "" {
		secret = "nexo-local-development-secret-change-me"
	}
	return &Server{Repo: repo, Secret: secret}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/v1/auth/register", s.register)
	mux.HandleFunc("/v1/auth/login", s.login)
	mux.HandleFunc("/v1/auth/refresh", s.refresh)
	mux.Handle("/v1/auth/me", s.withAuth(http.HandlerFunc(s.me)))
	mux.Handle("/v1/auth/logout", s.withAuth(http.HandlerFunc(s.logout)))
	mux.Handle("/v1/tenants", s.withAuth(http.HandlerFunc(s.tenants)))
	mux.Handle("/v1/navigation/sidebar", s.withAuth(http.HandlerFunc(s.sidebar)))
	return withJSON(mux)
}
func withJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func errorJSON(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
func decode(r *http.Request, target any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(target)
}
func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok", "service": "nexo-core-api", "persistence": "postgres"})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var in registerRequest
	if decode(r, &in) != nil || !validEmail(in.Email) || strings.TrimSpace(in.Name) == "" || !validPassword(in.Password) {
		errorJSON(w, 400, "invalid_registration", "nombre, correo y una contraseña segura son obligatorios")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(w, 500, "password_error", "no se pudo proteger la contraseña")
		return
	}
	mail := strings.ToLower(strings.TrimSpace(in.Email))
	u := auth.User{ID: uuid.NewString(), Email: mail, Name: strings.TrimSpace(in.Name), PasswordHash: string(passwordHash), Active: true, CreatedAt: time.Now().UTC()}
	if err = s.Repo.CreateUser(r.Context(), u); err != nil {
		if err == ports.ErrConflict {
			errorJSON(w, 409, "email_already_registered", "el correo ya está registrado")
			return
		}
		errorJSON(w, 503, "persistence_unavailable", "no se pudo guardar el usuario")
		return
	}
	writeJSON(w, 201, map[string]any{"user": map[string]any{"id": u.ID, "email": u.Email, "name": u.Name}, "next_step": "create_tenant"})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var in loginRequest
	if decode(r, &in) != nil {
		errorJSON(w, 400, "invalid_credentials", "credenciales inválidas")
		return
	}
	u, err := s.Repo.FindUserByEmail(r.Context(), in.Email)
	if err != nil || !u.Active || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		errorJSON(w, 401, "invalid_credentials", "credenciales inválidas")
		return
	}
	session, err := s.createSession(r.Context(), u)
	if err != nil {
		errorJSON(w, 503, "session_error", "no se pudo crear la sesión")
		return
	}
	writeJSON(w, 200, session)
}
func (s *Server) createSession(ctx context.Context, u auth.User) (map[string]any, error) {
	now := time.Now().UTC()
	sid := uuid.NewString()
	claims := auth.Claims{Subject: u.ID, SessionID: sid, Expires: now.Add(8 * time.Hour).Unix()}
	access, err := sign(claims, s.Secret)
	if err != nil {
		return nil, err
	}
	refresh := randomToken()
	if err = s.Repo.CreateSession(ctx, auth.Session{ID: sid, UserID: u.ID, AccessHash: hash(access), RefreshHash: hash(refresh), ExpiresAt: now.Add(8 * time.Hour), RefreshUntil: now.Add(24 * time.Hour)}); err != nil {
		return nil, err
	}
	return map[string]any{"access_token": access, "refresh_token": refresh, "expires_at": claims.Expires, "profile": s.profile(u)}, nil
}
func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var in refreshRequest
	if decode(r, &in) != nil || in.RefreshToken == "" {
		errorJSON(w, 401, "invalid_refresh", "refresh token inválido")
		return
	}
	session, err := s.Repo.FindSessionByRefreshHash(r.Context(), hash(in.RefreshToken))
	if err != nil || session.RevokedAt != nil || !session.RefreshUntil.After(time.Now()) {
		errorJSON(w, 401, "invalid_refresh", "refresh token inválido")
		return
	}
	if err = s.Repo.RevokeSession(r.Context(), session.ID, time.Now().UTC()); err != nil {
		errorJSON(w, 503, "session_unavailable", "no se pudo revocar la sesión anterior")
		return
	}
	user, err := s.Repo.FindUser(r.Context(), session.UserID)
	if err != nil {
		errorJSON(w, 401, "invalid_refresh", "usuario no encontrado")
		return
	}
	result, err := s.createSession(r.Context(), user)
	if err != nil {
		errorJSON(w, 503, "session_error", "no se pudo renovar la sesión")
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if raw == "" {
			errorJSON(w, 401, "unauthorized", "token ausente")
			return
		}
		var c auth.Claims
		if !verify(raw, s.Secret, &c) {
			errorJSON(w, 401, "unauthorized", "token inválido o vencido")
			return
		}
		session, err := s.Repo.FindSession(r.Context(), c.SessionID)
		if err != nil || session.RevokedAt != nil || !session.ExpiresAt.After(time.Now()) || !hmac.Equal(session.AccessHash, hash(raw)) {
			errorJSON(w, 401, "unauthorized", "sesión vencida o revocada")
			return
		}
		user, err := s.Repo.FindUser(r.Context(), c.Subject)
		if err != nil || !user.Active {
			errorJSON(w, 401, "unauthorized", "usuario inactivo")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, c)))
	})
}
func claims(r *http.Request) auth.Claims {
	value, _ := r.Context().Value(claimsKey).(auth.Claims)
	return value
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	user, err := s.Repo.FindUser(r.Context(), c.Subject)
	if err != nil {
		errorJSON(w, 404, "profile_not_found", "perfil no encontrado")
		return
	}
	items, err := s.Repo.ListTenants(r.Context(), c.Subject)
	if err != nil {
		errorJSON(w, 503, "tenants_unavailable", "no se pudieron consultar los tenants")
		return
	}
	writeJSON(w, 200, map[string]any{"profile": s.profile(user), "tenants": items})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if err := s.Repo.RevokeSession(r.Context(), claims(r).SessionID, time.Now().UTC()); err != nil {
		errorJSON(w, 503, "session_unavailable", "no se pudo cerrar la sesión")
		return
	}
	writeJSON(w, 200, map[string]bool{"logged_out": true})
}
func (s *Server) tenants(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	if r.Method == http.MethodGet {
		items, err := s.Repo.ListTenants(r.Context(), c.Subject)
		if err != nil {
			errorJSON(w, 503, "tenants_unavailable", "no se pudieron consultar los tenants")
			return
		}
		writeJSON(w, 200, map[string]any{"tenants": items})
		return
	}
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	var in tenantRequest
	if decode(r, &in) != nil || strings.TrimSpace(in.Name) == "" {
		errorJSON(w, 400, "invalid_tenant", "el nombre del tenant es obligatorio")
		return
	}
	slug := slugify(in.Slug)
	if slug == "" {
		slug = slugify(in.Name)
	}
	item := tenant.Tenant{ID: uuid.NewString(), Name: strings.TrimSpace(in.Name), Slug: slug, CreatedAt: time.Now().UTC()}
	err := s.Repo.CreateTenant(r.Context(), item, tenant.Membership{UserID: c.Subject, TenantID: item.ID, Role: "owner"})
	if err != nil {
		if err == ports.ErrConflict {
			errorJSON(w, 409, "tenant_slug_taken", "el slug ya está en uso")
			return
		}
		errorJSON(w, 503, "persistence_unavailable", "no se pudo crear el tenant")
		return
	}
	writeJSON(w, 201, map[string]any{"tenant": item, "membership": map[string]string{"role": "owner"}})
}
func (s *Server) sidebar(w http.ResponseWriter, r *http.Request) {
	c := claims(r)
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		items, err := s.Repo.ListTenants(r.Context(), c.Subject)
		if err == nil && len(items) > 0 {
			tenantID = items[0].ID
		}
	}
	role, err := s.Repo.MembershipRole(r.Context(), c.Subject, tenantID)
	if err != nil {
		role = "member"
	}
	items := []map[string]any{{"id": "overview", "label": "Inicio", "description": "Contexto de tu organización", "route": "/", "icon": "layout-dashboard", "capabilities": []string{}}, {"id": "onsite-operations", "label": "Onsite Operations", "description": "Check-in y operación presencial", "route": "/onsite", "icon": "calendar-check-2", "capabilities": []string{"onsite:read"}}}
	if role == "member" {
		items = items[:1]
	}
	writeJSON(w, 200, map[string]any{"items": items, "role": role})
}
func (s *Server) profile(u auth.User) map[string]any {
	return map[string]any{"id": u.ID, "name": u.Name, "email": u.Email}
}
func validEmail(value string) bool {
	return regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`).MatchString(strings.TrimSpace(value))
}
func validPassword(value string) bool {
	if len([]rune(value)) < 8 {
		return false
	}
	var upper, lower, num, special bool
	for _, r := range value {
		switch {
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= 'a' && r <= 'z':
			lower = true
		case r >= '0' && r <= '9':
			num = true
		case r != ' ' && r != '\t' && r != '\n':
			special = true
		}
	}
	return upper && lower && num && special
}
func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}
func randomToken() string {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}
func hash(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }
func sign(c auth.Claims, secret string) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payloadBytes, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	unsigned := header + "." + payload
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
func verify(token, secret string, c *auth.Claims) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(payload, c) != nil {
		return false
	}
	return c.Subject != "" && c.SessionID != "" && c.Expires > time.Now().Unix()
}
