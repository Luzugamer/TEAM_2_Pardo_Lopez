DATABASE_URL ?= postgres://nexo_onsite:nexo_onsite@localhost:5434/nexo_onsite?sslmode=disable
MIGRATE ?= migrate
PSQL ?= psql

db-up:
	docker compose up -d postgres
db-migrate:
	docker compose run --rm migrate
db-seed:
	docker compose run --rm seed
db-reset:
	docker compose down -v
	docker compose up -d postgres
	$(MAKE) db-migrate db-seed
run:
	DATABASE_URL="$(DATABASE_URL)" APP_ENV=development go run ./cmd/api

compose-up:
	docker compose up -d

compose-down:
	docker compose down
test:
	$(MAKE) db-up db-migrate db-seed
	ONSITE_TEST_DATABASE_URL="$(DATABASE_URL)" go test ./...
vet:
	go vet ./...
