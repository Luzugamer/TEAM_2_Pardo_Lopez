---
title: 'Base frontend Nexo con microfrontends e integración del Equipo 4'
type: 'feature'
created: '2026-11-10'
status: 'done'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - '/Users/juancx/Documents/CX-Developments/SELF/nexo/README.md'
  - '/Users/juancx/Documents/CX-Developments/SELF/nexo/docs/POS-BASELINE.md'
  - '/Users/juancx/Documents/CX-Developments/SELF/design-system/nexo-platform/MASTER.md'
  - '/Users/juancx/Documents/CX-Developments/SELF/onsite-operations/frontend/src/main.tsx'
  - '/Users/juancx/Documents/CX-Developments/SELF/onsite-operations/frontend/src/styles.css'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nexo necesita una base frontend estable para que varios equipos puedan trabajar en paralelo sin que un cambio de un módulo rompa el shell, la navegación o el sistema visual. El avance del Equipo 4 existe como una aplicación independiente y debe convertirse en el primer microfrontend integrado.

**Approach:** Crear una aplicación React/Vite que actúe como shell, con contratos explícitos de microfrontend (`id`, rutas, navegación, permisos y render), carga local mediante registro de módulos y una frontera preparada para remotos. Crear un design system atómico compartido (tokens, atoms, molecules, organisms y layout) que sea la única fuente visual del shell y de Onsite.

## Boundaries & Constraints

**Always:** todos los módulos se montan dentro de `AppShell`; el sidebar se alimenta de manifests y capabilities, no de rutas hardcodeadas de cada módulo; cada microfrontend tiene namespace de rutas y estado aislado; componentes consumen tokens, no colores/espaciados arbitrarios; navegación y controles usan HTML semántico, foco visible y estados loading/error/empty. El primer módulo será `onsite-operations`, adaptado desde el Equipo 4, con sus fixtures y llamadas a `http://localhost:8080` configurables por entorno.

**Never:** copiar el frontend de Equipo 4 como una segunda app dentro de Nexo; permitir que un microfrontend modifique el estado global directamente; acoplar módulos por imports internos; crear un design system paralelo; implementar aún autenticación real, backend Core API real, Module Federation remoto productivo o persistencia.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Shell | Registro con módulos habilitados | Renderiza sidebar y módulo activo desde manifest | Manifest inválido se omite y muestra aviso no bloqueante |
| Navegación | Click en módulo/ruta | Cambia ruta sin perder contexto del shell | Ruta inexistente muestra Not Found del shell |
| Permisos | Usuario mock sin capability | No ve la entrada ni puede montar la ruta | Acceso directo devuelve vista Forbidden |
| Onsite | Módulo Team 4 habilitado | Renderiza check-in, asistencia y Operations dentro del shell | API caída muestra estado de conexión y conserva UI navegable |
| Tema | Cambio claro/oscuro | Tokens semánticos actualizan toda la app y el módulo | Contraste/foco se mantiene visible |
</frozen-after-approval>

## Code Map

- `docs/POS-BASELINE.md` -- decisiones reutilizables de shell, auth, multitenancy, tokens y contratos.
- `design-system/nexo-platform/MASTER.md` -- dirección visual generada y persistida para Nexo.
- `/Users/juancx/Documents/CX-Developments/SELF/onsite-operations/frontend/src/main.tsx` -- avance Team 4 que debe adaptarse, no duplicarse como app separada.
- `/Users/juancx/Documents/CX-Developments/SELF/onsite-operations/frontend/src/styles.css` -- estilos operativos a migrar a tokens/componentes Nexo.
- `frontend/` -- carpeta destino nueva, actualmente sin implementación.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` -- crear runtime React/Vite, alias, scripts, tests y build.
- [x] `frontend/src/design-system/tokens.css`, `atoms.tsx`, `molecules.tsx`, `organisms.tsx` -- implementar tokens primitivo/semántico/componente y componentes compartidos.
- [x] `frontend/src/platform/microfrontends/*` -- crear contratos TypeScript, registry local, lifecycle de montaje y manifest de capabilities.
- [x] `frontend/src/shell/*` -- crear AppShell, sidebar dinámico, header de tenant/workspace, rutas protegidas mock, tema y estados Not Found.
- [x] `frontend/src/microfrontends/onsite-operations/*` -- integrar la experiencia Team 4 como microfrontend React usando exclusivamente componentes/tokens Nexo y API configurable.
- [x] `frontend/e2e/*` y tests de registry -- cubrir permisos, navegación y montaje del módulo.
- [x] `README.md`, `docs/microfrontend-contract.md`, `docs/design-system.md` -- documentar integración para los demás equipos.

**Acceptance Criteria:**
- Given la app instalada, when se ejecuta `npm run dev`, then el shell muestra navegación dinámica, tenant mock y un módulo Onsite montado.
- Given un manifest con capability no disponible, when se renderiza el shell, then el módulo no aparece y una navegación directa muestra Forbidden.
- Given un cambio de tokens, when se modifica el tema, then shell y Onsite reflejan el mismo sistema visual sin estilos paralelos.
- Given la API Team 4 apagada, when se abre Onsite, then la interfaz muestra estado de conexión sin romper el shell.
- Given `npm run test`, `npm run build` y `npm run test:e2e`, when terminan, then todos pasan y los demás equipos tienen contrato documentado para registrar módulos.

## Implementation Notes

- Implementación creada en `frontend/` con registry local y frontera `load()` preparada para remotos.
- Team 4 fue adaptado como `onsite-operations`; no se mantiene una segunda app dentro del shell.
- La carga lazy usa `setComponent(() => loaded)` para evitar que React interprete el componente como updater de estado.
- Verificación completada el 2026-11-10: unit tests 2/2, build Vite, validación de tokens y E2E 1/1.

## Spec Change Log

## Review Triage Log

## Design Notes

- El runtime inicial usa registry local y lazy imports para que el contrato sea estable desde el día uno. La frontera `MicrofrontendModule` permite sustituir el loader por Module Federation sin cambiar el shell ni la navegación.
- Atomic design no significa que cada feature importe todo: atoms y molecules son públicos; organisms/layouts son los únicos que conocen composición; los módulos sólo consumen el paquete público.

## Verification

**Commands:**
- `npm run test` -- expected: unit/component tests pass.
- `npm run build` -- expected: production bundle compiles.
- `npm run test:e2e` -- expected: shell, permission and Onsite flows pass.
- `npm run tokens:validate` -- expected: no hardcoded design values in app styles.
