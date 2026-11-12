# Nexo Core API

Backend Go/Fiber del shell Nexo. Esta base extrae únicamente los procesos de identidad y contexto del POS y usa PostgreSQL como fuente oficial de datos:

- registro de usuario;
- login, refresh, logout y sesión actual;
- creación y listado de tenants;
- navegación del sidebar filtrada por membership/capabilities.

No incluye operaciones de eventos, CMS, check-in, reportes ni HukID. Esas capacidades pertenecen a los microservicios y equipos definidos para la plataforma.

## Ejecutar

```bash
go mod tidy
docker compose up -d postgres migrate
DATABASE_URL='postgres://nexo:nexo-local-only@localhost:5433/nexo?sslmode=disable' \
NEXO_JWT_SECRET='cambia-esta-clave-en-entornos-reales' go run ./cmd/api
```

La API queda en `http://localhost:8081`. La base PostgreSQL queda en `localhost:5433`. El frontend puede apuntar al Core API con `VITE_CORE_API_URL=http://localhost:8081` cuando se conecte el adaptador de sesión real.

Para levantar todo el stack, incluyendo el backend compilado en Docker:

```bash
docker compose up -d --build
```

Las migraciones se ejecutan con la imagen oficial de `golang-migrate` y viven en `migrations/`. Para reiniciar la base local desde cero:

```bash
make db-reset
```

## Endpoints

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/healthz` | No | Salud del servicio |
| POST | `/v1/auth/register` | No | Crear usuario |
| POST | `/v1/auth/login` | No | Crear sesión |
| POST | `/v1/auth/refresh` | No | Rotar refresh token |
| GET | `/v1/auth/me` | Sí | Perfil y tenants |
| POST | `/v1/auth/logout` | Sí | Revocar sesión |
| GET/POST | `/v1/tenants` | Sí | Listar/crear tenants |
| GET | `/v1/navigation/sidebar` | Sí | Menú del shell |

El runtime de producción usa `internal/platform/postgres`. `internal/platform/memory` se conserva únicamente como adaptador de pruebas unitarias. Las contraseñas se almacenan con bcrypt y los tokens sólo se guardan como hashes.
