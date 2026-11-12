FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/configuration-api/package.json apps/configuration-api/package.json
COPY apps/configuration-worker/package.json apps/configuration-worker/package.json
COPY apps/configuration-admin/package.json apps/configuration-admin/package.json
RUN pnpm install --frozen-lockfile --filter @team-2/configuration-api --filter @team-2/configuration-worker --filter .

COPY apps/configuration-api apps/configuration-api
RUN pnpm build:api

FROM node:22-bookworm-slim AS runtime

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
ENV NODE_ENV=production PORT=3000
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/configuration-api/package.json apps/configuration-api/package.json
COPY --chown=node:node apps/configuration-worker/package.json apps/configuration-worker/package.json
COPY --chown=node:node apps/configuration-admin/package.json apps/configuration-admin/package.json
RUN pnpm install --prod --frozen-lockfile --filter @team-2/configuration-api --filter @team-2/configuration-worker --filter . \
    && rm -rf apps/configuration-admin \
    && pnpm store prune \
    && chown -R node:node /app

COPY --from=build --chown=node:node /app/apps/configuration-api/dist apps/configuration-api/dist
COPY --chown=node:node apps/configuration-worker/src apps/configuration-worker/src
COPY --chown=node:node db/migrations db/migrations
COPY --chown=node:node db/nexo-migrations db/nexo-migrations
COPY --chown=node:node scripts/migrate.mjs scripts/migrate.mjs
COPY --chown=node:node scripts/bootstrap-local.mjs scripts/bootstrap-local.mjs

USER node
EXPOSE 3000
CMD ["node", "apps/configuration-api/dist/main.js"]
