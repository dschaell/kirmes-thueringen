#!/bin/sh
# Bildet das Quality Gate der CI im Container nach (Lint, Typen, Build, Tests mit Mindestabdeckung).
# Läuft ausschließlich gegen die Wegwerf-Datenbank db-test (Issue #445).
set -eu
cd /app
npm run lint
npx tsc -b apps/api
npm run build
npm run db:migrate
npm run db:orte
npm run db:beispiele
npm run test:coverage
