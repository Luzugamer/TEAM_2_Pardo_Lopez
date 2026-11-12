# Convenciones PostgreSQL de Nexo

## Regla objetivo

Nexo tendrá una única base lógica llamada `nexo`. Los límites de datos son schemas, no bases por microservicio:

```text
nexo
├── identity       # Core API
├── tenants        # Core API
├── onsite         # Onsite Operations
├── events         # Equipo de Eventos
├── cms            # Equipo CMS/Landing
└── platform_meta  # sólo metadata de migraciones
```

Un servicio es dueño de su schema, de sus migraciones y de su rol PostgreSQL. Ningún servicio hace joins ni escrituras sobre schemas de otro servicio.

## DB-PLATFORM-01 — Pendiente bloqueante para nuevos backends

El estado actual es transitorio: Core usa `nexo` y Onsite usa `nexo_onsite`. Antes de integrar un nuevo backend se debe completar esta tarea de plataforma:

1. Crear el Compose/orquestador raíz para PostgreSQL `nexo`.
2. Crear `platform_meta`, schemas y un rol sin privilegios globales por servicio.
3. Migrar Onsite al schema `onsite` de `nexo` sin pérdida de datos de desarrollo.
4. Reemplazar los `docker-compose.yml` con bases aisladas por perfiles que consuman el Postgres raíz.
5. Publicar `make db-up`, `make db-reset-test` y `make db-verify` desde la raíz.

Mientras `DB-PLATFORM-01` no esté terminado, los equipos pueden diseñar dominio, OpenAPI, UI y tests con mocks, pero no deben crear una tercera base ni considerar integrado su backend.

## Migraciones por servicio

Las migraciones viven con el servicio y empiezan en `000001`; la metadata no puede compartir la tabla default `schema_migrations`.

Cada servicio usa una tabla exclusiva dentro de `platform_meta`:

```text
platform_meta.identity_schema_migrations
platform_meta.onsite_schema_migrations
platform_meta.events_schema_migrations
```

Con `golang-migrate`, la URL debe fijar el schema y una tabla de control calificada. Ejemplo para Eventos:

```text
postgres://events_migrator:<secret>@postgres:5432/nexo?sslmode=disable&search_path=events&x-migrations-table=%22platform_meta%22.%22events_schema_migrations%22&x-migrations-table-quoted=true
```

`golang-migrate` soporta `search_path`, `x-migrations-table` y `x-migrations-table-quoted`; la tabla separada evita que servicios con archivos `000001` colisionen. La referencia oficial está en la [documentación de golang-migrate](https://github.com/golang-migrate/migrate/blob/master/database/postgres/README.md).

## Roles mínimos

| Rol | Permisos |
| --- | --- |
| `<service>_runtime` | `USAGE` en su schema y CRUD sólo sobre sus tablas/secuencias. |
| `<service>_migrator` | `USAGE, CREATE` en su schema y acceso a su tabla dentro de `platform_meta`. |
| `platform_admin` | Administra schemas/roles; no se usa desde APIs. |

El runtime configura `search_path=<schema>,public`. Las migraciones califican explícitamente objetos cross-schema de `platform_meta`; los servicios no obtienen privilegios sobre datos de negocio de otros schemas.

## Entornos y reset

- Desarrollo: una instancia local compartida, con schemas aislados.
- CI: una instancia efímera por job. Se crea, migra, siembra y destruye al finalizar.
- Nunca ejecutar `down -v`, `db-reset` o `DROP SCHEMA` contra el Postgres compartido de desarrollo.
- Todo seed es idempotente y declara en su README los IDs estables que exporta para E2E.
