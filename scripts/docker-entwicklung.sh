#!/bin/sh
# Entwicklungsmodus im Container: Migrationen, Core bauen, API und Website mit Neuladen (Issue #445).
set -eu
cd /app
npm run build -w @kirmes/core
npm run db:migrate
exec npx concurrently -k -n api,web -c blue,green \
  "npm run dev -w @kirmes/api" \
  "npm run dev -w @kirmes/web -- --host 0.0.0.0"
