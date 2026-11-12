---
name: nexo-module-integration
description: Integra un microfrontend o microservicio de Nexo sin romper el shell, los contratos, fixtures ni el flujo Git compartido.
---

# Nexo Module Integration

Usar cuando se agregue o modifique un módulo de Nexo.

## Antes de cambiar código

1. Leer `CONTRIBUTING.md` y `docs/engineering/MODULE-INTEGRATION.md` completos.
2. Identificar el dueño del área. Si toca shell, design system, router, i18n existente, contratos o fixtures compartidos, clasificarlo como cambio de plataforma.
3. Crear rama desde `develop`: `feature/team-<n>-<dominio>-<accion>`.
4. Confirmar namespace de rutas, `module id`, capacidades y schema propietario. No asumir ni reutilizar uno ajeno.

## Microfrontend

1. Crear `frontend/src/microfrontends/<module-id>/`.
2. Exponer únicamente un componente raíz que reciba `ModuleContext`.
3. Usar exports de `frontend/src/design-system`; no copiar sidebar, tokens o CSS global.
4. Usar claves i18n en español e inglés.
5. Registrar el manifest y sus rutas en `frontend/src/platform/microfrontends/registry.tsx`; el shell monta rutas desde ese registry, no mediante una ruta fija nueva.
6. Añadir pruebas de registro/capacidades, incluida URL directa sin permiso, y los estados loading, empty, error y forbidden.

## Microservicio

1. Crear `microservices/<service-id>/` con dominio, aplicación, puertos y adaptadores separados.
2. Publicar/actualizar `docs/openapi.yaml` antes de conectar el frontend.
3. Usar el schema dueño dentro de la base `nexo`, tabla de metadata de migración exclusiva y rol PostgreSQL de mínimo privilegio; no acceder a tablas privadas de otro bounded context.
4. Crear migraciones nuevas e inmutables y seeds idempotentes para pruebas locales.
5. Cubrir autorización, tenant isolation, errores RFC 7807, idempotencia y concurrencia cuando el caso tenga escrituras.

## Antes del PR

Ejecutar, como mínimo:

```bash
cd frontend && npm run tokens:validate && npm run build && npm run test
cd ../backend && go test ./... && go vet ./...
```

Ejecutar `npm run test:e2e` cuando cambie un flujo transversal. Ejecutar `go test ./... && go vet ./...` en cada microservicio modificado; para Onsite ejecutar `make test` para incluir PostgreSQL. Leer `docs/engineering/POSTGRESQL-CONVENTIONS.md`: hasta completar `DB-PLATFORM-01`, no crear un backend adicional conectado a una tercera base.

No modificar una fixture compartida ni un contrato existente sin una sección de compatibilidad, migración y rollback en el PR.
