# Contribuir a Nexo

Esta guía es obligatoria para los equipos que integren módulos en Nexo. Su objetivo es permitir trabajo paralelo sin romper el shell, los contratos, los fixtures ni los datos de otro equipo.

## Reglas no negociables

1. `main` y `develop` no reciben pushes directos. Todo cambio llega mediante Pull Request (PR) con CI verde y una revisión aprobada. La configuración obligatoria del remoto está en `docs/engineering/GITHUB-REPOSITORY-SETUP.md`.
2. El shell es dueño de sesión, tenant activo, rutas globales, sidebar, internacionalización y design system. Un módulo no modifica esos elementos fuera de una tarea acordada para el equipo de plataforma.
3. Un microfrontend no importa archivos internos de otro microfrontend. Sólo usa contratos públicos del shell y del design system.
4. Cada ruta pertenece a un único namespace, por ejemplo `/cms/*`, `/events/*` o `/onsite/*`.
5. La plataforma usa una sola base PostgreSQL lógica, `nexo`; cada bounded context es dueño de su schema y no lee ni escribe tablas privadas de otro schema.
6. No se cambian fixtures, seeds, contratos ni tokens compartidos para hacer pasar una prueba propia. Si el cambio es necesario, se abre un PR de plataforma con los equipos afectados como revisores.
7. Los textos de interfaz se agregan a `frontend/src/core/i18n.ts` en español e inglés. No se dejan literales nuevos en componentes.

## Flujo Git

Se usa Gitflow ligero:

```text
main     ← producción y entregas estables
develop  ← rama predeterminada de GitHub e integración continua de los equipos
feature/*, fix/*, chore/*, docs/* ← trabajo de corta duración
```

Todo PR funcional se abre contra `develop`. `main` sólo recibe PRs de `release/*` y `hotfix/*`; GitHub debe usar `develop` como base predeterminada para impedir que un PR nuevo apunte a `main` por defecto.

Al iniciar una tarea:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/team-2-events-create-event
```

Al terminar:

```bash
git fetch origin
git rebase origin/develop
# ejecutar las verificaciones obligatorias
git push -u origin feature/team-2-events-create-event
```

El PR se abre hacia `develop`. Sólo un release manager crea `release/*` desde `develop` y lo fusiona a `main`; los hotfix críticos salen de `main` mediante `hotfix/*` y luego vuelven también a `develop`.

| Rama origen | PR destino | Después del merge |
| --- | --- | --- |
| `feature/*`, `fix/*`, `chore/*`, `docs/*` | `develop` | Borrar la rama; `develop` conserva el historial de integración. |
| `release/*` | `main` | Etiquetar `vX.Y.Z` y abrir PR de back-merge a `develop`. |
| `hotfix/*` | `main` | Etiquetar patch y abrir PR de back-merge a `develop`. |

Antes de mergear, la rama debe estar actualizada con el destino y el CI debe ejecutarse de nuevo. Un rebase o force-push invalida aprobaciones previas.

### Convención de ramas

```text
feature/team-<n>-<dominio>-<accion>
fix/team-<n>-<dominio>-<incidencia>
chore/<alcance>-<accion>
docs/<alcance>-<tema>
hotfix/<incidencia>
release/<version>
```

Ejemplos: `feature/team-1-cms-event-publication`, `fix/team-4-onsite-idempotency`, `docs/platform-integration-guide`.

### Convención de commits

Usar Conventional Commits, en inglés y en imperativo:

```text
feat(onsite): persist attendance history
fix(shell): preserve active tenant after refresh
docs(integration): define microfrontend checklist
test(events): cover duplicate registration
chore(ci): add contract verification
```

Cada commit debe ser pequeño, reversible y no mezclar refactorización no relacionada con una funcionalidad.

## Checklist obligatorio de Pull Request

- [ ] La rama parte de `develop` y el PR apunta a `develop` (excepto `release/*` y `hotfix/*`, según la tabla anterior).
- [ ] El alcance corresponde a un solo módulo o cambio de plataforma explícito.
- [ ] Se actualizaron contrato OpenAPI/evento y consumidores cuando cambió una interfaz pública.
- [ ] Se agregaron o ajustaron pruebas del módulo sin alterar fixtures ajenos.
- [ ] El frontend ejecuta `npm run tokens:validate`, `npm run build` y `npm run test`.
- [ ] Si toca shell, sesión, tenant, registry, API o fixtures compartidos, ejecuta `npm run test:e2e`; CI lo ejecuta para todo PR.
- [ ] Go ejecuta `go test ./...` y `go vet ./...` en cada servicio modificado; Onsite además ejecuta `make test`.
- [ ] Las migraciones son nuevas, ordenadas, reversibles y usan el schema dueño.
- [ ] No hay secretos, `.env`, `node_modules`, `dist` ni artefactos locales en el diff.
- [ ] Los textos nuevos existen en `es` y `en`.

## Cuándo abrir un PR de plataforma

Se requiere un PR de plataforma, no uno de módulo, si se cambia cualquiera de estos elementos:

- `frontend/src/platform/**`, `frontend/src/shell/**` o `frontend/src/design-system/**`.
- `frontend/src/core/i18n.ts` cuando se cambian claves existentes.
- `frontend/e2e/**` o fixtures compartidos.
- Contratos de sesión, tenant, capacidades o API compartida.
- Un schema, tabla o migración que no pertenezca al equipo.

El PR debe incluir una nota de compatibilidad, migración para consumidores y revisión de los dueños afectados.

## Estado de los gates

- CI, PR template y validación del registry viven en este repositorio.
- Branch protection, required checks y required reviewers se configuran en GitHub cuando exista `origin`; no pueden imponerse desde Git local. Seguir la guía de setup antes de sumar equipos.
- La compatibilidad semántica OpenAPI será revisada por el dueño del contrato hasta que se incorpore un gate automatizado de diff. Ningún cambio incompatible puede fusionarse sin versionado/deprecación explícita.
