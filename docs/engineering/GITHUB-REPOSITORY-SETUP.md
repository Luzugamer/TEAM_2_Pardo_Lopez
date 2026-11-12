# Configuración del repositorio GitHub

Esta configuración se aplica una vez creado y conectado el remoto `origin`. Git local no puede imponer revisiones ni branch protection.

## Bootstrap

```bash
git remote add origin <URL-DEL-REPOSITORIO>
git push -u origin main
git push -u origin develop
```

La rama `develop` ya debe existir localmente antes de incorporar equipos. En **GitHub → Settings → General → Default branch**, cambiar la rama predeterminada de `main` a `develop`. No entregar acceso de escritura directo a `main`.

Con `develop` como predeterminada, los PR nuevos proponen esa rama como destino. Sólo los release managers deben cambiar manualmente el destino a `main` para `release/*` y `hotfix/*`.

## Rulesets requeridos

Aplicar el mismo ruleset a `main` y `develop`:

- Bloquear pushes directos y force-pushes.
- Requerir PR antes de merge.
- Requerir una aprobación; para archivos de plataforma, requerir revisión de Code Owners.
- Invalidar aprobaciones cuando cambie el head del PR.
- Requerir rama actualizada antes del merge.
- Requerir los checks `frontend-quality`, `frontend-e2e`, `core-api` y `onsite-operations`.
- Restringir bypass a release manager y administrador del repositorio, dejando registro de auditoría.

## Code Owners

Copiar `.github/CODEOWNERS.example` a `.github/CODEOWNERS` y reemplazar los placeholders por usuarios o equipos GitHub reales antes de activar “Require review from Code Owners”. No activar el ruleset mientras existan placeholders.

## Releases

- Un release manager crea `release/<version>` desde `develop`.
- El PR a `main` exige los mismos checks y revisión.
- Tras fusionar: crear tag anotado `vX.Y.Z`, publicar release y abrir el PR de back-merge a `develop`.
- Un hotfix sigue el mismo flujo desde `main`; nunca se entrega sólo a `main`.
