FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/configuration-api/package.json apps/configuration-api/package.json
COPY apps/configuration-worker/package.json apps/configuration-worker/package.json
COPY apps/configuration-admin/package.json apps/configuration-admin/package.json
RUN pnpm install --frozen-lockfile
COPY apps/configuration-admin apps/configuration-admin
RUN pnpm --filter @team-2/configuration-admin build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/configuration-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/configuration-admin/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
