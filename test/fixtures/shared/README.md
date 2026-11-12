# Fixtures compartidos

Esta carpeta sólo contiene datos requeridos por más de un módulo o por un flujo E2E transversal.

## Registro obligatorio

Antes de agregar un fixture, crear una entrada en este archivo con:

| ID/prefijo | Dueño | Consumidores | Estado mínimo | Reset |
| --- | --- | --- | --- | --- |

Los IDs usan `<team>-<dominio>-<nombre>`, por ejemplo `team-2-events-demo-day`. No se reutilizan IDs ni se modifican casos existentes; se agrega una nueva variante.

## Aislamiento

- Las pruebas E2E deben ejecutar contra una base efímera o un reset controlado por CI.
- Un fixture compartido no puede depender del orden de otro test.
- Cambiar esta carpeta requiere revisión de Quality y del dueño del fixture cuando `CODEOWNERS` esté activo.
