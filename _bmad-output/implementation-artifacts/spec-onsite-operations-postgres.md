---
title: 'Persistencia PostgreSQL y operación real de Onsite Operations'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/juancx/Documents/CX-Developments/SELF/nexo/README.md'
  - '/Users/juancx/Documents/CX-Developments/SELF/onsite-operations/_bmad-output/implementation-artifacts/spec-onsite-operations-mocked-mvp.md'
  - '/Users/juancx/Documents/Codex/Startup/planning-artifacts/replans/event-platform-5-team-microservices-2026-11-02/backlogs/TEAM-4-ONSITE-OPERATIONS.md'
  - '/Users/juancx/Documents/Codex/Startup/planning-artifacts/replans/event-platform-5-team-microservices-2026-11-02/contracts/API-CONTRACTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El backend de Onsite Operations usa un `Store` en memoria, tickets hardcodeados y métricas fijas. Los check-ins se pierden al reiniciar; no existe un escenario reproducible de Demo Day, una garantía transaccional ante dos operadores concurrentes ni E2E que pruebe búsqueda manual y QR contra datos persistentes.

**Approach:** Crear `microservices/onsite-operations` como servicio Go/Fiber independiente del Core API, con PostgreSQL, `golang-migrate`, seed de Demo Day IncubaUNAS y repositorios hexagonales. Se reutilizan dominio, Swagger y contratos RFC 7807 del prototipo; el primer corte vertical será seed → búsqueda exacta → check-in QR/manual → historial/dashboard → pruebas persistentes.

**Persistencia objetivo:** Nexo tendrá una única base PostgreSQL lógica compartida (`nexo`). Cada bounded context tendrá un schema propio; Onsite utilizará `onsite`. La base `nexo_onsite` usada por este primer corte es temporal y queda como pendiente de consolidación antes de integrar todos los servicios.

## Boundaries & Constraints

**Always:**

- Core API conserva identidad, sesión, tenant y membresías. Onsite usa la base independiente `nexo_onsite` y nunca consulta/escribe `identity.*`.
- Onsite es dueño de proyecciones operativas mínimas, asignaciones, dispositivos, hechos de asistencia, idempotencia y auditoría. No crea, confirma, cancela ni reactiva registros o tickets.
- La asistencia es append-only: check-in inserta un hecho; no hay `UPDATE`/`DELETE`. Una corrección futura es un hecho compensatorio `void`.
- Cada escritura exige `Idempotency-Key` UUID. Misma clave y mismo body reproduce la respuesta; misma clave y body diferente produce `409 idempotency_key_reused`.
- La aplicación valida para presentar errores claros; PostgreSQL garantiza la unicidad efectiva ante concurrencia.
- Actor, tenant, rol y dispositivo se derivan del contexto autenticado. El adaptador local solo permite headers mock en `development` y `test`.
- Swagger se genera desde Go y documenta headers, bodies, respuestas y problemas RFC 7807.

**Never:** compartir tablas con Core, aceptar actor/dispositivo libre desde body, exponer PII completa, guardar QR íntegro en logs, borrar hechos, implementar HukID real, modo offline, certificados o reportes asíncronos en este incremento.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Readiness | Staff con asignación vigente | Devuelve evento/scope/dispositivo y `ready=true` | `403 assignment_forbidden` |
| Búsqueda | `q` exacto >=4 caracteres | Máximo 5 candidatos con titular enmascarado | `200 []` inexistente; `400 invalid_query` |
| QR válido | `nexo:ticket:DEMO-2026-001` | Extrae ticket y ejecuta mismo check-in | QR malformado no llama al API |
| Check-in | Ticket activo, scope correcto, key nueva | Fact + presencia + idempotencia + audit en una transacción; `201` | Rollback completo |
| Retry | Misma key/body | Mismo status/body/fact ID | Sin hecho adicional |
| Doble ingreso | Key diferente, ticket ya presente | No crea segundo hecho | `409 already_present` |
| Ticket inválido | Revocado/expirado/otro evento/scope | Sin escrituras | `422` con código estable |
| Concurrencia | Dos POST simultáneos | Solo una presencia efectiva | Constraint única determina el resultado |

</frozen-after-approval>

## Arquitectura y propiedad de datos

```text
React microfrontend ──HTTP──► Onsite Operations API ──► PostgreSQL nexo_onsite
                                  │
                                  ├── dominio / aplicación / puertos
                                  ├── adaptadores PostgreSQL
                                  └── adaptador de claims

Nexo Core API ── identidad, token, tenant, roles ──► contexto de petición
Future Events/Participation ── proyecciones autorizadas ──► ticket_projections
```

Onsite no consulta sincrónicamente Eventos/Participación en este incremento. El seed materializa las proyecciones; luego un consumidor/API de sincronización las actualizará sin cambiar casos de uso.

## Modelo PostgreSQL y migraciones

Migraciones en `microservices/onsite-operations/migrations`, pares `00000N_*.up.sql`/`.down.sql`:

| Migración | Cambios |
|---|---|
| `000001_schema` | extensión `pgcrypto`; esquema `onsite` |
| `000002_reference_data` | `events`, `scopes`, `devices`, `operator_assignments` |
| `000003_ticket_projections` | proyecciones de ticket e índices exactos |
| `000004_attendance` | hechos, presencia efectiva e índices de historial |
| `000005_idempotency_audit` | idempotencia, auditoría e integridad |
| `000006_dev_seed` | Demo Day idempotente, solo local/test |

| Tabla | Columnas mínimas | Restricciones |
|---|---|---|
| `onsite.events` | `id uuid`, `tenant_id uuid`, `source_event_id`, `name`, `status`, `starts_at`, `ends_at` | `UNIQUE(tenant_id,source_event_id)`; estado `draft/active/closed` |
| `onsite.scopes` | `id`, `event_id`, `code`, `name`, `kind` | `UNIQUE(event_id,code)`; kind `event/venue/gate/session/track` |
| `onsite.devices` | `id`, `tenant_id`, `label`, `status`, `revoked_at` | estado `active/revoked` |
| `onsite.operator_assignments` | `id`, `user_id`, `event_id`, `scope_id`, `device_id`, `role`, vigencia | rol `staff/supervisor/manager` |
| `onsite.ticket_projections` | `ticket_id`, `event_id`, `scope_id`, `status`, `expires_at`, `masked_holder`, `search_code`, `confirmed_at` | PK `ticket_id`; índice `(event_id,search_code)` |
| `onsite.attendance_facts` | `id`, `ticket_id`, `event_id`, `scope_id`, `type`, `actor_id`, `device_id`, `occurred_at`, `reason`, `compensates_fact_id` | type `check_in/check_out/void` |
| `onsite.effective_attendance` | `ticket_id`, `event_id`, `scope_id`, `check_in_fact_id`, `checked_in_at` | `UNIQUE(ticket_id,event_id,scope_id)` |
| `onsite.idempotency_records` | `key`, `actor_id`, `request_hash`, `status_code`, `response_body jsonb`, `created_at` | PK `(key,actor_id)` |
| `onsite.audit_log` | `id`, `tenant_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `trace_id`, `metadata`, `occurred_at` | metadata sin QR/PII completa |

## Seed local y de pruebas

El seed usa IDs estables y `INSERT ... ON CONFLICT`; no va en producción. Crea `INCUBA UNAS`, `event-demo`, scope `main`, dispositivo `device-demo-001`, asignación de `staff-demo` y totales de referencia: 128 inscritos/96 confirmados.

| Ticket | Estado | Uso E2E |
|---|---|---|
| `DEMO-2026-001` | active/confirmado | QR exitoso |
| `DEMO-2026-002` | active/confirmado | búsqueda manual y éxito |
| `DEMO-2026-003` | active/presente | `already_present` |
| `DEMO-2026-004` | revoked | `ticket_revoked` |
| `DEMO-2026-005` | expired | `ticket_expired` |
| `FIIS-2026-001` | otro evento | `wrong_event` |
| `DEMO-CYBER-001` | otro scope | `wrong_scope` |

## Contratos HTTP obligatorios

Prefijo definitivo: `/onsite/v1`; el frontend deja de usar `/api/v1/onsite`.

| Método y ruta | Request/Auth | Éxito | Errores |
|---|---|---|---|
| `GET /health/live` | público | `200 {status:'ok'}` | — |
| `GET /health/ready` | público | `200` con BD disponible | `503` sin BD |
| `GET /onsite/v1/readiness?event_id&scope` | `onsite:checkin` | asignación y ready | `403`, `422` |
| `GET /onsite/v1/tickets/search?q&event_id&scope` | `onsite:checkin` | candidatos minimizados | `400`, `403`, `429` |
| `POST /onsite/v1/attendance/check-ins` | `Idempotency-Key`, `{ticket_id,event_id,scope}` | `201 AttendanceFactResponse` | `403`, `409`, `422` |
| `GET /onsite/v1/attendance?event_id&scope&cursor&limit` | `onsite:read` | historial y `next_cursor` | `400`, `403` |
| `GET /onsite/v1/dashboard?event_id` | `onsite:read` | inscritos, confirmados, presentes, porcentaje | `403`, `404` |

`AttendanceFactResponse`: `id`, `ticket_id`, `event_id`, `scope`, `type`, `occurred_at`, `effective_status`. Todos los problemas contienen `type`, `title`, `status`, `code`, `detail`, `trace_id`.

## Code Map

- `microservices/onsite-operations/go.mod` -- nuevo módulo Go: Fiber v3, pgx v5, UUID, swaggo.
- `microservices/onsite-operations/cmd/api/main.go` -- config, pool, router, shutdown y health.
- `microservices/onsite-operations/internal/onsite/domain/*` -- portar `Ticket`/`AttendanceFact`; errores tipados.
- `microservices/onsite-operations/internal/onsite/application/*` -- `SearchTicket`, `CheckIn`, `ListAttendance`, `Dashboard`, dependientes de puertos.
- `microservices/onsite-operations/internal/onsite/ports/*` -- repositorios, transacciones, reloj y claims.
- `microservices/onsite-operations/internal/onsite/adapters/postgres/*` -- pgx, conflictos `23505`, cursores y transacciones.
- `microservices/onsite-operations/internal/platform/http/*` -- Fiber, trace, CORS local, auth adapter, validación, RFC 7807, Swagger.
- `microservices/onsite-operations/migrations/*`, `seeds/*`, `tests/*` -- persistencia verificable y dataset.
- `microservices/onsite-operations/docker-compose.yml` -- Postgres, migrate, seed y API :8082.
- `frontend/src/microfrontends/onsite-operations/OnsiteModule.tsx` -- cliente tipado, QR/código, búsqueda/selección, resultados y métricas remotas.
- `frontend/e2e/onsite-persistence.spec.ts` -- búsqueda, QR, rechazo, duplicado y persistencia.
- `backend/` -- Core existente; no modificar contratos ni migraciones.

## Tasks & Acceptance

**Orden de ejecución:**

- [x] Crear esqueleto, `Dockerfile`, `Makefile`, `.env.example`, compose, README y comandos `db-up`, `db-migrate`, `db-seed`, `db-reset`, `run`, `test`.
- [x] Crear seis migraciones reversibles y seed separado/repetible.
- [x] Portar dominio, definir puertos y eliminar mapas/mutex del runtime productivo.
- [x] Implementar repositorios pgx con timeouts, transacción de check-in y traducción de conflicto SQL.
- [x] Implementar handlers, validación, autorización local de desarrollo, trace ID, Swagger y health.
- [x] Crear reset habilitado solo en perfil `test` para aislar E2E; no exponerlo en desarrollo/producción.
- [x] Crear cliente HTTP y UI: texto QR/manual, búsqueda, selección explícita, feedback y dashboard.
- [x] Escribir unidades de dominio, integración PostgreSQL, HTTP contract, carrera concurrente y Playwright.
- [x] Ejecutar Swagger, vet, tests, build frontend y E2E antes de cerrar.

**Acceptance Criteria:**

- Given una BD vacía, when `db-migrate` y `db-seed` se ejecutan, then Demo Day opera sin Store mock.
- Given `DEMO-2026-002`, when staff busca, selecciona y confirma, then recibe `201`, se persiste un hecho y aumenta `present`.
- Given QR `nexo:ticket:DEMO-2026-001`, when UI lo procesa, then usa el mismo check-in y no expone QR en logs/respuestas.
- Given un ticket ya presente, when se intenta con otra key, then UI muestra error y dashboard no aumenta.
- Given dos POST simultáneos, when terminan, then existe exactamente un fact efectivo y una presencia efectiva.
- Given reinicio no destructivo, when se consulta, then historial/métricas previas siguen visibles.
- Given request inválido/no autorizado, when llega, then se responde RFC 7807 sin stack trace ni PII innecesaria.

## Implementation Notes

La sincronización real desde Eventos/Participación está diferida. El seed define la frontera; los puertos impiden acoplar el caso de uso al origen. El JWT final de Core tampoco bloquea este corte: habrá interfaz de claims y adapter mock restringido por entorno, sustituible cuando Core publique su contrato.

## Review Triage Log

- `patch` -- La integración PostgreSQL se saltaba sin `ONSITE_TEST_DATABASE_URL`; `make test` ahora levanta migraciones/seed y ejecuta la prueba contra PostgreSQL.
- `patch` -- El E2E solo verificaba el mensaje de éxito; ahora verifica el contador después del check-in y tras recargar la página.
- `patch` -- Playwright no provisionaba Onsite; `e2e-onsite-stack.mjs` recrea el stack Docker para cada ejecución.
- `patch` -- La autorización no validaba asignación, tenant, dispositivo ni vigencia; el router ahora consulta la asignación persistida antes de operar.
- `patch` -- Las consultas no aislaban tenant; repositorios de búsqueda, historial y dashboard ahora filtran por `tenant_id`.
- `patch` -- El trace ID no llegaba a auditoría; ahora se propaga en claims y se persiste.
- `false` -- El seed no produce 129/97; los 122 registros adicionales completan correctamente 128 registrados y 96 confirmados para `event-demo`.
- `defer` -- Check-out, void, reportes reales, certificados y HukID permanecen fuera del primer corte vertical aprobado.
- `defer` -- Consolidar `nexo_onsite` dentro de la base PostgreSQL única `nexo`, conservando el schema `onsite` y los límites de propiedad de datos.

## Design Notes

La transacción de check-in: lock/lectura de idempotencia → comparación de hash → validación de asignación/proyección → insert fact → insert presence → guardar respuesta idempotente → audit. El conflicto único se traduce a `already_present`; nunca se usa un check previo no atómico como protección final. El middleware mock queda restringido a desarrollo/test; producción exige Authorization mientras se conecta el adaptador JWT del Core.

## Verification

**Commands:**

- `docker compose up -d postgres && make db-migrate db-seed` en `microservices/onsite-operations` -- esperado: esquema/seed repetibles.
- `go test ./... && go vet ./...` -- esperado: dominio, repositorios, handlers y carrera verdes.
- `swag init --generalInfo cmd/api/main.go --dir . --output docs --parseDependency --parseInternal` -- esperado: Swagger completo y actualizado.
- `npm run build && npm run test:e2e` en `frontend` con los servicios activos -- esperado: búsqueda/QR persistentes verdes.
