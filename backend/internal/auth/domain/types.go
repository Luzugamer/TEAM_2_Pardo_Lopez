package domain

import "time"

type User struct {
	ID           string
	Email        string
	Name         string
	PasswordHash string
	Active       bool
	CreatedAt    time.Time
}

type Session struct {
	ID           string
	UserID       string
	AccessHash   []byte
	RefreshHash  []byte
	ExpiresAt    time.Time
	RefreshUntil time.Time
	RevokedAt    *time.Time
}

type Claims struct {
	Subject   string   `json:"sub"`
	SessionID string   `json:"sid"`
	Expires   int64    `json:"exp"`
	TenantIDs []string `json:"tenant_ids"`
}
