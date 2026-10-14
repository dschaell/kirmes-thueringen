#!/usr/bin/env bash
# Legt die Test-Datenbank „kirmes_test“ im lokalen Container an und migriert sie.
# Integrationstests laufen ausschließlich dagegen – nie gegen die Arbeitsdatenbank „kirmes“.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --wait db >/dev/null
docker compose exec -T db psql -U kirmes -d kirmes -tAc "SELECT 1 FROM pg_database WHERE datname = 'kirmes_test'" | grep -q 1 \
  || docker compose exec -T db psql -U kirmes -d kirmes -qc "CREATE DATABASE kirmes_test"
PW="${POSTGRES_PASSWORD:-kirmes_dev_only}"
DATABASE_URL="postgres://kirmes:${PW}@127.0.0.1:${DB_PORT:-5432}/kirmes_test" npm run migrate -w @kirmes/api >/dev/null
echo "✔ Test-Datenbank kirmes_test bereit"
