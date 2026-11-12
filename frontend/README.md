# Nexo Frontend

Shell React/Vite con microfrontends registrados por contrato y un design system atómico compartido.

## Ejecutar

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:5174`. Para conectar el backend del Equipo 4:

```bash
VITE_TEAM4_API_URL=http://localhost:8082 npm run dev
```

El backend de Team 4 se ejecuta aparte desde `../microservices/onsite-operations`. La sesión, tenant y capabilities del shell son mocks deliberados en esta base; el Core API los reemplazará en la siguiente integración.

## Microfrontends

Un módulo se registra en `src/platform/microfrontends/registry.tsx` mediante `MicrofrontendManifest`. El shell sólo conoce identidad, navegación, icono, capabilities y loader. El módulo debe exportar un componente que reciba `ModuleContext`; no puede modificar estado global ni importar componentes internos de otro módulo.

El runtime actual usa lazy loading local. La interfaz `load()` deja preparada la sustitución por un remote loader/Module Federation cuando el equipo defina el despliegue independiente.

## Design system

`src/design-system` aplica atomic design:

- `tokens.css`: primitivas, semántica y tokens de componentes.
- `atoms.tsx`: Button, IconButton, Badge, Card, Input y Select.
- `molecules.tsx`: PageHeading, StatCard, EmptyState, ModuleLink y StatusLine.
- `organisms.tsx`: Sidebar y navegación móvil.

Shell y Onsite consumen estos componentes. No agregues colores ni espaciados directamente en un microfrontend.

La integración de Team 4 vive en `src/microfrontends/onsite-operations/OnsiteModule.tsx` y conserva el flujo de check-in, asistencia, reportes y acciones mock de HukID dentro del shell Nexo.

Consulta [docs/microfrontend-contract.md](docs/microfrontend-contract.md) para registrar un nuevo módulo y [docs/design-system.md](docs/design-system.md) para consumir el sistema visual.

## Verificación

```bash
npm run test
npm run build
npm run test:e2e
npm run tokens:validate
```

## Módulo de configuración de eventos — desarrollo local

El módulo `src/microfrontends/events` se registra bajo `/events` y adapta los flujos del frontend demostrativo de Configuration. La navegación, el contexto, los componentes y los tokens visuales pertenecen al shell Nexo. Incluye eventos, agenda, sedes, ponentes, publicación y actividad para las operaciones disponibles.

**Estado:** el módulo se habilita exclusivamente en el servidor de desarrollo mediante `VITE_EVENTS_DEMO=true`. El shell añade capacidades de eventos para ese modo y el cliente envía `x-dev-actor` a la API local. El actor se elige por separado del tenant del shell. Esto es una demostración y no acredita identidad ni permisos reales. Fuera del modo demo el módulo no recibe esas capacidades simuladas y no envía el actor. La integración con el cliente autenticado y Core sigue pendiente. El artefacto de formularios se construye con datos locales de PostgreSQL; el broker continúa simulado. La integración real de formularios con Participation sigue pendiente.

Para probar en Windows PowerShell, levantar el fixture aislado de la copia local de Configuration. No es la base compartida de Nexo: se usa solo para desarrollo y pruebas, mientras Platform completa `DB-PLATFORM-01`. Para evitar conflictos con Core, se usa un puerto PostgreSQL local distinto:

```powershell
# En nexo-develop/microservices/event-configuration; copiar .env.example a .env y configurar contraseñas locales
$env:DB_PORT = '5435'
docker compose up -d --build

# En nexo-develop/backend; levantar Core y su PostgreSQL
docker compose up -d --build

# En nexo-develop/frontend
npm ci
$env:VITE_EVENTS_DEMO = 'true'
npm run dev
```

Abrir `http://localhost:5174`, iniciar sesión o registrar un usuario y tenant en Core, y acceder a **Eventos**. En desarrollo Vite envía `/configuration/v1` a `http://127.0.0.1:3000`. Si la API usa otra URL, establecer `VITE_EVENTS_API_URL` antes de iniciar Vite; la API deberá permitir CORS para ese origen. Para cargar datos ficticios seguir `db/seed/datos-demostracion.sql` en `microservices/event-configuration`, con el procedimiento de su README.

Verificación del módulo: `npm run test`, `npm run tokens:validate`, `npm run build` y `npm run test:e2e:events`. En Windows puede usarse Edge instalado con `$env:EVENTS_BROWSER_CHANNEL='msedge'`; sin esa variable Playwright usa Chromium instalado. La prueba de API real es opcional y requiere `EVENTS_LIVE_API` apuntando a una base de Configuration **aislada con seed**; crea datos en esa base. `npm run test:e2e:shell-check` verifica el shell, Onsite con sus llamadas no disponibles y el acceso denegado sin capability. Las pruebas de otros flujos de Onsite tienen su propio entorno.

**Pendiente técnico:** el cliente y los formularios adaptados todavía conservan `RecordData`/`any` de la demo. Deben sustituirse por modelos y validación de respuestas derivados de los contratos antes de considerar cerrada la calidad del módulo. El build advierte que el bundle principal supera 500 kB.
