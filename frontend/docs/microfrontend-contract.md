# Contrato de microfrontends

Cada equipo entrega un módulo React aislado y lo registra en el shell mediante un `MicrofrontendManifest`.

```ts
type MicrofrontendManifest = {
  id: string;
  name: string;
  description: string;
  group: string;
  defaultRoute: string;
  routes: string[];
  capabilities: Capability[];
  icon: ReactNode;
  load: () => Promise<ComponentType<{ context: ModuleContext }>>;
};

type ModuleContext = {
  version: 1;
  tenantId: string;
  workspaceId: string;
  capabilities: Capability[];
  apiBaseUrl: string;
  theme: 'light' | 'dark';
};
```

## Reglas de integración

1. El módulo vive bajo `src/microfrontends/<id>` y expone un componente raíz que recibe `context`.
2. Sus rutas deben usar un namespace propio, por ejemplo `/cms`, `/registrations` o `/onsite`.
3. El módulo no importa componentes internos de otro módulo ni modifica estado global del shell.
4. Todo color, tipografía, espaciado, foco y estado visual usa `src/design-system` y sus tokens.
5. El acceso se declara con `capabilities`; el shell filtra el menú y el montaje con el mismo contrato, incluido el acceso directo por URL.
6. Estados de carga, error, vacío y API no disponible deben ser visibles y no romper `AppShell`.

## Registro

Agregar el manifest a `src/platform/microfrontends/registry.tsx`. El runtime actual carga módulos localmente con `load()` y resuelve rutas desde ese registry. En despliegue independiente, el cuerpo de `load()` puede sustituirse por un remote loader/Module Federation sin cambiar navegación, permisos ni el componente raíz.

El manifest debe pasar `validateRegistry()`: `id` y rutas únicas, `defaultRoute` declarada y rutas hijas dentro de su namespace.

## API y sesión

La implementación actual usa `ModuleContext` mock para permitir trabajo paralelo. Cuando el Core API esté disponible, el shell reemplazará `tenantId`, `workspaceId`, `capabilities` y `apiBaseUrl` por la sesión real; el contrato de cada microfrontend permanece estable.
