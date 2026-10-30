# syntax=docker/dockerfile:1
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
RUN npm ci --workspace @kirmes/web --workspace @kirmes/core --include-workspace-root
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w @kirmes/core && npm run build -w @kirmes/web \
 && npm prune --omit=dev --workspace @kirmes/web --workspace @kirmes/core

FROM node:26-alpine
# Freie Schrift für die Vorschaubilder der Termine (Issue #110)
RUN apk add --no-cache font-dejavu
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json packages/core/
COPY --from=build --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=build --chown=node:node /app/apps/web/package.json apps/web/
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
COPY --chown=node:node apps/web/server.mjs apps/web/sicherheits-header.mjs apps/web/rate-limit.mjs apps/web/zaehler.mjs apps/web/
USER node
EXPOSE 4321
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:4321/impressum >/dev/null || exit 1
CMD ["node", "apps/web/server.mjs"]
