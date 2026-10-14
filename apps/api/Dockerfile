# syntax=docker/dockerfile:1
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN npm ci --workspace @kirmes/api --workspace @kirmes/core --include-workspace-root
COPY packages/core packages/core
COPY apps/api apps/api
RUN npx tsc -b apps/api \
 && npm prune --omit=dev --workspace @kirmes/api --workspace @kirmes/core

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json packages/core/
COPY --from=build --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --chown=node:node db db
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:3100/health/live || exit 1
CMD ["node", "apps/api/dist/main.js"]
