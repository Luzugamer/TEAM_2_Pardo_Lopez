# Integración de módulos Nexo

## Propiedad de la plataforma

| Área | Dueño | Los módulos pueden |
| --- | --- | --- |
| Shell, sesión, tenant, sidebar y router | Equipo de plataforma | Consumir `ModuleContext` y registrar manifests mediante PR |
| Design system y tokens | Equipo de plataforma | Componer átomos/moléculas; proponer cambios mediante PR de plataforma |
| Cada microfrontend | Equipo de dominio | Crear rutas, vistas, estado, pruebas y cliente HTTP de su dominio |
| API Core | Equipo Core | Publicar identidad, tenant, membresías y permisos |
| Schema de dominio | Equipo de dominio | Crear y migrar únicamente su schema |

## Agregar un microfrontend

1. Cree `frontend/src/microfrontends/<module-id>/`.
2. Exponga un componente raíz con esta firma; no cambie el contrato:

```tsx
import type { ModuleContext } from '../../platform/microfrontends/contracts';

export function EventsModule({ context }: { context: ModuleContext }) {
  return <section>{context.tenantId}</section>;
}
```

3. Use únicamente exports públicos de `frontend/src/design-system`. No copie CSS del shell, ni use colores/espaciados arbitrarios fuera de los tokens.
4. Agregue las claves de interfaz en `frontend/src/core/i18n.ts` para `es` y `en`.
5. Declare un manifest en `frontend/src/platform/microfrontends/registry.tsx`. El shell resuelve y carga rutas desde el manifest; no agregue rutas fijas al `AppShell`.

```tsx
{
  id: 'events',
  name: 'Eventos',
  description: 'Gestiona eventos y programas',
  group: 'Gestión',
  defaultRoute: '/events',
  routes: ['/events', '/events/new'],
  capabilities: ['events:read'],
  icon: <CalendarDays size={17} />,
  load: async () => EventsModule,
}
```

6. Declare capacidades con el formato `<dominio>:<acción>`, por ejemplo `events:read`. El shell usa el manifest para ocultar navegación y también para negar el montaje por URL directa.
7. Añada pruebas de registro para rutas/capacidades, incluida una prueba de acceso directo sin permiso, y pruebas de comportamiento para el módulo.

### Reglas de rutas y navegación

- El `id` es estable, kebab-case y único: `events`, `cms`, `registrations`.
- Las rutas empiezan por el mismo namespace: `/events`, `/events/*`.
- Un módulo no usa rutas de otro módulo como contenedor ni redefine `/`, `/login` o `/tenant`.
- Los hijos del sidebar se declaran en `children` del manifest. El grupo padre es sólo agrupación; el hijo es la ruta navegable.

### Lo que un módulo recibe

`ModuleContext` versión `1` contiene `tenantId`, `workspaceId`, `capabilities`, `apiBaseUrl`, `theme` y la ruta actual. Un cambio incompatible exige una nueva versión de contexto y migración coordinada de todos los módulos. Un módulo:

- Nunca toma `tenantId`, `actorId`, rol ni permisos desde inputs o query params.
- Nunca persiste sesión propia en `localStorage`/`sessionStorage`.
- Construye URLs contra `context.apiBaseUrl` y deja que el backend derive la identidad del token.
- Maneja estados loading, empty, error, forbidden y API no disponible sin desmontar el shell.

### Identidad y autorización

El contrato productivo definitivo es `Authorization: Bearer <access-token>` emitido por Core API. El token determina actor, membresías y tenant activo; los servicios no aceptan `tenant_id`, actor o rol libres desde el navegador. Los headers `X-Mock-*` sólo existen en desarrollo/test y ningún módulo nuevo puede depender de ellos como contrato productivo.

La renovación de sesión y un cliente HTTP compartido son pendientes de plataforma. Hasta que se publiquen, los equipos pueden construir UI y contratos contra mocks, pero no pueden declarar terminada una integración productiva con una API de dominio.

## Agregar un microservicio

Ubicación: `microservices/<service-id>/`.

Estructura mínima:

```text
microservices/<service-id>/
├── cmd/api/
├── internal/<bounded-context>/{domain,application,ports}/
├── internal/platform/{http,postgres}/
├── migrations/
├── docs/openapi.yaml
├── tests/
├── Dockerfile
├── Makefile
└── README.md
```

Reglas:

- Go + Fiber; dominio y casos de uso no importan Fiber, pgx ni infraestructura.
- Se documenta cada endpoint en OpenAPI antes de integrarlo en el frontend.
- Errores HTTP usan `application/problem+json` con `code` estable y `trace_id`.
- Las escrituras expuestas públicamente requieren autorización, validación de tenant y, cuando aplique, `Idempotency-Key`.
- Las migraciones son inmutables: se agrega una nueva, nunca se edita una ya integrada.
- La base objetivo es `nexo`; el servicio sólo migra su schema (`events`, `cms`, `onsite`, etc.) y usa una tabla de versión exclusiva: `platform_meta.<service>_schema_migrations`. La URL de `golang-migrate` debe incluir `search_path=<schema>` y `x-migrations-table-quoted=true`.
- Cada servicio usa un rol PostgreSQL propio con `USAGE, CREATE` sólo en su schema; no se entregan credenciales de superusuario a la API. No se permiten joins a schemas ajenos para implementar reglas de negocio.
- Se intercambia información entre dominios mediante API o eventos/proyecciones documentadas.

La consolidación hacia la BD única todavía no está implementada: Core usa `nexo` y Onsite usa temporalmente `nexo_onsite`. Ningún equipo debe crear una tercera base o asumir la topología final; primero debe completarse la tarea de plataforma `DB-PLATFORM-01` descrita en `POSTGRESQL-CONVENTIONS.md`.

## Contratos y cambios compatibles

1. Añadir campos opcionales es compatible.
2. Renombrar/eliminar campos, cambiar tipos, rutas o semántica exige una versión nueva (`/v2`) o fase de deprecación acordada.
3. Un productor publica primero el contrato y pruebas; un consumidor se adapta después. No se fusionan cambios incompatibles simultáneos.
4. El PR identifica productor, consumidores, plan de rollback y fecha de retiro de cualquier endpoint deprecado.
5. Mientras no exista un diff automático OpenAPI, el dueño del contrato debe aprobar el PR. La CI al menos valida que el documento exista y sea YAML válido; el gate semántico es una tarea de plataforma pendiente.

## Fixtures, seeds y pruebas

- Cada equipo mantiene fixtures en su módulo: `frontend/src/microfrontends/<id>/__fixtures__/` o `microservices/<id>/seeds/`.
- Los fixtures compartidos viven en `test/fixtures/shared/`, se registran en su catálogo y usan el prefijo del dueño (`team-2-events-*`, por ejemplo).
- Los datos compartidos de E2E tienen IDs estables y son aditivos. Nunca cambie un caso existente para acomodar uno nuevo.
- Un test debe crear su propio estado o ejecutar contra una BD/compose efímero; jamás debe invocar `db-reset` contra una base compartida de desarrollo.
- Si requiere alterar un fixture compartido, agregue el caso nuevo y mantenga el anterior; solicite revisión del dueño de la prueba.
- Antes de PR ejecute las verificaciones de `CONTRIBUTING.md`.
