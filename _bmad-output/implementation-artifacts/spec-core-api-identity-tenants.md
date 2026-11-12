---
title: 'Core API Nexo para identidad, tenants y navegación'
type: 'feature'
created: '2026-11-10'
status: 'done'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
---

<frozen-after-approval reason="alcance solicitado por el usuario">

## Intent

Crear el backend Core de Nexo en Go con el patrón de transporte utilizado por POS: Fiber en el borde y reglas independientes del framework. El alcance se limita a registro, login, refresh/logout, sesión actual, creación/listado de tenants y navegación del sidebar. No se incorporan operaciones de eventos, CMS, check-in, reportes, HukID ni funcionalidades del dominio POS.

El runtime usa PostgreSQL como fuente oficial. Las migraciones se ejecutan con `golang-migrate` dentro de Docker Compose. El adaptador `internal/platform/memory` se conserva sólo para pruebas unitarias rápidas. Las credenciales se protegen con bcrypt y los tokens se guardan como hashes.

</frozen-after-approval>

## Code Map

- `backend/cmd/api/main.go`: proceso Fiber y configuración del puerto.
- `backend/internal/httpapi/server.go`: adaptador HTTP, autenticación HMAC, handlers y contratos JSON.
- `backend/internal/auth/domain/types.go`: entidades User, Session y Claims.
- `backend/internal/tenant/domain/types.go`: Tenant y Membership.
- `backend/internal/navigation/domain/types.go`: Item del sidebar.
- `backend/internal/platform/ports/repository.go`: contrato de persistencia.
- `backend/internal/platform/postgres/store.go`: adaptador PostgreSQL de runtime.
- `backend/internal/platform/memory/store.go`: adaptador en memoria para pruebas unitarias.
- `backend/migrations/000001_identity.up.sql`: esquema inicial de identidad y multitenancy.
- `backend/docker-compose.yml`: PostgreSQL, migrator y Core API.
- `backend/internal/httpapi/server_test.go`: prueba integrada de registro → login → tenant → sidebar.

## Acceptance Criteria

- Given un correo no registrado, when se llama `POST /v1/auth/register`, then se crea el usuario y se indica que el siguiente paso es crear un tenant.
- Given credenciales válidas, when se llama `POST /v1/auth/login`, then se entregan access token, refresh token y perfil.
- Given una sesión válida, when se llama `POST /v1/tenants`, then se crea el tenant y membership owner.
- Given una sesión válida, when se llama `GET /v1/navigation/sidebar`, then se devuelve el menú disponible para el usuario.
- Given un token revocado, when se llama una ruta protegida, then la API responde 401.

## Verification

- `go test ./...`
- `go vet ./...`

## Implementation Notes

- El backend queda separado del backend de Team 4 y escucha por defecto en `:8081`.
- El secreto por defecto sólo facilita desarrollo local; producción debe definir `NEXO_JWT_SECRET`.
- PostgreSQL es obligatorio para ejecutar `cmd/api`; no existe fallback de memoria en runtime.
- `docker compose up -d --build` levanta PostgreSQL, aplica la migración y ejecuta Core API.
