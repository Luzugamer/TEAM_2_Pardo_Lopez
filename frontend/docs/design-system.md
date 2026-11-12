# Sistema de diseño Nexo

Nexo usa Atomic Design con una sola fuente visual compartida por el shell y todos los microfrontends.

## Capas

- `tokens.css`: primitivas, tokens semánticos y tokens de componentes; también contiene el tema oscuro.
- `atoms.tsx`: controles indivisibles como `Button`, `IconButton`, `Badge`, `Card`, `Input` y `Select`.
- `molecules.tsx`: composiciones reutilizables como `PageHeading`, `StatCard`, `EmptyState`, `ModuleLink` y `StatusLine`.
- `organisms.tsx`: estructuras de mayor nivel como `Sidebar` y navegación móvil.
- `index.ts`: punto de entrada público recomendado para los módulos.

Ejemplo:

```tsx
import { Button, Card, PageHeading } from '../../design-system';

export function FeaturePage() {
  return (
    <Card>
      <PageHeading title="Mi módulo" description="Descripción de la operación." />
      <Button>Continuar</Button>
    </Card>
  );
}
```

No se deben introducir colores hexadecimales, sombras ni espaciados arbitrarios en un microfrontend. La validación `npm run tokens:validate` protege esta regla para los estilos del shell; los módulos deben seguir la misma convención.
