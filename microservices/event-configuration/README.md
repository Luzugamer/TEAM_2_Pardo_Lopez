# Event Configuration — Nexo

Esta carpeta es una copia local preparada en `microservices/event-configuration` dentro de Nexo. API y worker conservan NestJS/Node y su workspace pnpm; la demo `configuration-admin` es independiente del microfrontend `frontend/src/microfrontends/events`. El repositorio original del Grupo 2 se conserva intacto. Esta copia local de Nexo no contiene `.git`: el traslado aún no está revisado ni fusionado en Nexo.

El Compose de esta carpeta es un **fixture aislado de desarrollo**, con proyecto `nexo-events-local-fixture`; no es el PostgreSQL común ni completa `DB-PLATFORM-01`. No ejecutar su bootstrap contra la base compartida. La integración real de identidad, tenant, broker y consumidores sigue pendiente.

## Servicio de configuración de eventos

Proyecto del Grupo 2 para configurar eventos, recursos y agendas, y publicar versiones de su configuración. Incluye una API NestJS, PostgreSQL, un worker y una interfaz React en Docker Compose.

**Estado:** entorno de desarrollo. La copia local de Nexo contiene un módulo React demostrativo de eventos; su integración autenticada sigue pendiente. La API y la agenda trabajan con PostgreSQL; identidad, membresías y entrega al broker todavía tienen componentes simulados. Los formularios y bindings usan PostgreSQL; su integración con Participation sigue pendiente.

## Inicio rápido

Requiere Docker Desktop con Compose. Desde la raíz de este proyecto, si aún no tienes `.env`:

```powershell
Copy-Item .env.example .env
```

Configura contraseñas locales propias en `.env` y ejecuta:

```powershell
docker compose up --build -d
docker compose ps
```

- Interfaz: [http://localhost:8080](http://localhost:8080)
- Swagger: [http://localhost:8080/configuration/v1/docs](http://localhost:8080/configuration/v1/docs)
- API directa: `http://localhost:3000/configuration/v1`

Estos puertos pueden cambiarse en `.env`. Para ver el worker: `docker compose logs -f worker`. Los datos persisten en el volumen PostgreSQL entre reinicios normales.

La base local usa el schema `events`. Compose prepara roles y extensiones solo para desarrollo y ejecuta las migraciones con un rol separado; API y worker utilizan un rol restringido. El PostgreSQL compartido de Nexo aún no está integrado. Si el volumen contiene la instalación antigua en `public`, el arranque de migraciones se detiene para evitar sobrescribirla.

## Contratos y recursos

- [Guía de integración externa para otros equipos](docs/EXTERNAL-INTEGRATION.md).
- [Contrato HTTP OpenAPI 3.1](docs/openapi.yaml).
- [Schemas y ejemplos de eventos](contracts/configuration).
- [Datos SQL de demostración](db/seed/datos-demostracion.sql).

El compose local selecciona explícitamente los mocks de identidad y membresía y el broker simulado; el acoplamiento real sigue pendiente. Consulta Swagger para los datos y encabezados de cada operación.
