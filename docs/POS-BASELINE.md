# Baseline reutilizable del proyecto POS

## Hallazgos principales

### 1. Shell y navegación

POS concentra el shell en `apps/web/src/app/shell/app-shell.component.ts`. El componente ya resuelve:

- sidebar persistente y sidebar móvil;
- navegación declarativa con `label`, `route`, `icon` y `roles`;
- cierre de sidebar después de navegar;
- perfil y cierre de sesión;
- redirección contextual por rol.

Para Nexo esta idea debe evolucionar a un `AppShell` estable y liviano. El sidebar no debe conocer la lógica interna de cada microfrontend; debe recibir un registro de módulos y filtrar entradas por permisos/contexto.

### 2. Sesión y autorización de experiencia

`apps/web/src/app/core/session.service.ts` mantiene sesión, perfil, tenant, sede, roles, expiración y refresh coordinado. `auth.interceptor.ts` agrega el access token y reintenta después de renovar sesión; `auth.guard.ts` protege rutas.

Se reutiliza el patrón conceptual, pero en Nexo el backend Core API será la autoridad para:

- autenticación;
- membresías activas;
- tenant activo;
- permisos/capabilities;
- revocación de sesión.

Los guards del frontend sólo mejoran la experiencia y nunca reemplazan la autorización del backend.

### 3. Bootstrap de cuenta y tenant

POS tiene una secuencia útil en `login.component.ts` y `identity_repository.go`:

```text
GET /v1/bootstrap
    ↓
registro de usuario
    ↓
creación de empresa/tenant y local inicial
    ↓
creación de membership admin
    ↓
inicio de sesión
```

Para Nexo el concepto de `local` se generaliza como `workspace` o `context`, porque no todos los clientes tendrán sedes físicas. La secuencia debe conservar la transacción atómica de creación de tenant, usuario propietario y membership inicial.

### 4. Multitenancy backend

El POS usa una base PostgreSQL compartida con schemas por dominio, `tenant_id` en entidades y RLS con `app.tenant_id`. La sesión deriva `tenant_id`, `location_id`, actor y roles desde el token/membership.

Esta decisión es adecuada como punto de partida para Nexo, con estos ajustes:

- `tenant` representa la organización cliente;
- `workspace` es un contexto operativo opcional dentro del tenant;
- todas las tablas tenant-owned tienen `tenant_id`;
- el Core API establece contexto de tenant antes de ejecutar consultas;
- cada microfrontend sólo accede a APIs de su dominio.

### 5. Design system

POS ya tiene un sistema documentado en `design-system/pos-restaurante/MASTER.md` y `tokens.json`:

- tokens primitivo → semántico → componente;
- sidebar y superficies de navegación basadas en roles semánticos;
- botones, campos, paneles, modales y badges reutilizables;
- foco visible, targets táctiles de 44px, WCAG AA y `prefers-reduced-motion`;
- una sola familia tipográfica y una sola paleta.

Nexo debe tomar esta disciplina, no copiar literalmente la marca Mesa POS. El design system de Nexo será un paquete compartido consumido por el shell y los microfrontends, con versionado independiente y compatibilidad explícita.

### 6. API y contratos

POS tiene contratos en `packages/contracts/openapi.yaml`, rutas versionadas `/v1`, `Idempotency-Key` en comandos y errores con `code`, `message`, `details` y `requestId`. Nexo debe mantener esas convenciones en el Core API y separar los contratos de identidad de los contratos de cada microfrontend.

## Decisiones que se conservan

1. El frontend no es la autoridad de seguridad.
2. Toda mutación reintentable es idempotente.
3. El tenant se obtiene del contexto autenticado, no de un body confiable.
4. Los módulos de negocio no acceden directamente a tablas de otro módulo.
5. Los conectores externos se implementan detrás de puertos/adapters.

## Decisiones que deben replantearse para Nexo

1. POS es Angular monolítico; Nexo requiere React y microfrontends.
2. POS navega por rutas compiladas dentro de una aplicación; Nexo debe definir un contrato de registro/carga de módulos.
3. POS usa restaurante/local; Nexo debe separar organización, workspace y módulos habilitados.
4. POS tiene un Core API mezclado con ciertos dominios operativos; Nexo debe limitar el Core API a plataforma e identidad.
5. La estrategia de despliegue debe permitir publicar un microfrontend sin recompilar los demás.
