DATABASE_URL ?= postgres://nexo:nexo-local-only@localhost:5433/nexo?sslmode=disable

.PHONY: db-up db-down db-migrate db-reset run test

db-up:
	docker compose up -d postgres

db-migrate:
	docker compose run --rm migrate

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d postgres
	docker compose run --rm migrate

run:
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/api

test:
	go test ./...
	go vet ./...
