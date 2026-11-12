# Nexo

Nexo es la base de una plataforma web multi-tenant para organizaciones que necesitan publicar, administrar y operar módulos digitales independientes: eventos, convocatorias, participación, contenido, operaciones y futuras integraciones como HukID.

El proyecto nace a partir del aprendizaje del POS Restaurante, pero no queda limitado a restaurantes ni a un único tipo de operación.

## Estructura inicial

```text
nexo/
├── frontend/   # shell web + microfrontends React
├── backend/    # Core API y módulos de identidad/multitenancy
├── _bmad/      # proceso de construcción y documentación BMAD
└── _bmad-output/
```

## Dirección técnica inicial

- `frontend`: shell React responsable de sesión, tenant activo, navegación, layout, design tokens y carga de microfrontends.
- Microfrontends: módulos aislados por capacidad de negocio; cada uno posee rutas, pantallas, estado y pruebas propias, pero consume contratos compartidos del shell.
- `backend`: Core API Go/Fiber que resuelve registro, login, refresh, logout, perfil, creación/listado de tenants y navegación del sidebar. PostgreSQL es la persistencia oficial; el adaptador en memoria se conserva sólo para unit tests.
- Persistencia compartida: todos los microservicios de Nexo deben utilizar una única base PostgreSQL lógica (`nexo`) y separar su propiedad mediante schemas (`identity`, `tenants`, `onsite`, etc.). No se deben crear bases independientes por microservicio salvo una decisión arquitectónica explícita.
- Multitenancy: el tenant se deriva del contexto autenticado y de la membresía; nunca se confía en un `tenant_id` enviado libremente desde el navegador.
- Integraciones externas: se modelan detrás de puertos/adapters; HukID será un sistema separado y no compartirá base de datos ni bus interno.

## Estado

La base frontend y el Core API inicial ya están implementados. El frontend usa sesión mock temporalmente; el adaptador de sesión real contra el Core API queda como siguiente integración. Los módulos de eventos, CMS, check-in, reportes y HukID permanecen fuera del Core API.

## Integración de equipos

Antes de crear o modificar un módulo, leer [CONTRIBUTING.md](CONTRIBUTING.md) y la [guía de integración](docs/engineering/MODULE-INTEGRATION.md). El skill reutilizable para agentes está en [skills/nexo-module-integration/SKILL.md](skills/nexo-module-integration/SKILL.md).

## Regla pendiente de consolidación de PostgreSQL

Onsite Operations usa temporalmente la base `nexo_onsite` para aislar el primer corte vertical. Antes de integrar todos los servicios debe migrarse al PostgreSQL compartido del proyecto, usando el schema `onsite` dentro de la base `nexo`.

La base compartida no significa compartir tablas: cada servicio conserva la propiedad de su schema, migraciones y repositorios. La comunicación de negocio debe respetar contratos HTTP/eventos y no depender de joins contra tablas privadas de otro servicio.

Para levantar PostgreSQL, aplicar migraciones y ejecutar el backend:

```bash
cd backend
docker compose up -d --build
```

Consulta [`backend/README.md`](backend/README.md) y [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) para los contratos disponibles.

## Contexto reutilizado desde POS

La evaluación técnica de POS está documentada en [`docs/POS-BASELINE.md`](docs/POS-BASELINE.md). CodeGraph fue inicializado en POS para explorar el shell, la sesión, el bootstrap de tenant/local/administrador, la navegación por roles y los componentes compartidos.

## Módulo de eventos en desarrollo

La copia local contiene el módulo React de Configuration bajo `frontend/src/microfrontends/events`. Su modo de demostración, instrucciones y límites de identidad se describen en [frontend/README.md](frontend/README.md). La conexión productiva con Core y el backend de Configuration sigue pendiente.

## Servicio Event Configuration en preparación local

La copia de trabajo incluye `microservices/event-configuration` (API NestJS, worker Node, contratos, migraciones y pruebas), además del microfrontend `frontend/src/microfrontends/events`. La demo independiente sigue dentro del servicio para desarrollo. Esta estructura es local y no implica integración Git ni conexión al PostgreSQL común: consulta el [README del servicio](microservices/event-configuration/README.md) y el estado de `DB-PLATFORM-01` antes de integrarlo.
