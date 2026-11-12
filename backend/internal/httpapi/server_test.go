package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"nexo-backend/internal/platform/memory"
)

func TestRegisterLoginTenantAndSidebar(t *testing.T) {
	server := NewServer(memory.NewStore())
	handler := server.Handler()
	register := httptest.NewRecorder()
	handler.ServeHTTP(register, httptest.NewRequest(http.MethodPost, "/v1/auth/register", bytes.NewBufferString(`{"email":"owner@example.com","name":"Owner","password":"Strong!123"}`)))
	if register.Code != 201 {
		t.Fatalf("register status=%d", register.Code)
	}
	login := httptest.NewRecorder()
	handler.ServeHTTP(login, httptest.NewRequest(http.MethodPost, "/v1/auth/login", bytes.NewBufferString(`{"email":"owner@example.com","password":"Strong!123"}`)))
	if login.Code != 200 {
		t.Fatalf("login status=%d", login.Code)
	}
	var payload struct {
		AccessToken string `json:"access_token"`
	}
	_ = json.NewDecoder(login.Body).Decode(&payload)
	if payload.AccessToken == "" {
		t.Fatal("missing access token")
	}
	create := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/tenants", bytes.NewBufferString(`{"name":"IncubaUNAS"}`))
	req.Header.Set("Authorization", "Bearer "+payload.AccessToken)
	handler.ServeHTTP(create, req)
	if create.Code != 201 {
		t.Fatalf("tenant status=%d body=%s", create.Code, create.Body.String())
	}
	sidebar := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/v1/navigation/sidebar", nil)
	req.Header.Set("Authorization", "Bearer "+payload.AccessToken)
	handler.ServeHTTP(sidebar, req)
	if sidebar.Code != 200 {
		t.Fatalf("sidebar status=%d", sidebar.Code)
	}
}
