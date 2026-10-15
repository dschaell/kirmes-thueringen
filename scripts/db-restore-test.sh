#!/usr/bin/env bash
# Restore-Test: spielt ein Backup in eine WEGWERF-Datenbank ein und vergleicht Zeilenzahlen mit der
# laufenden Datenbank. Die Arbeitsdatenbank wird dabei nicht verändert.
#   ./scripts/db-restore-test.sh [backups/kirmes-….dump]   (ohne Angabe: neuestes Backup)
set -euo pipefail
cd "$(dirname "$0")/.."
DATEI="${1:-$(ls -t backups/kirmes-*.dump 2>/dev/null | head -1)}"
[ -n "$DATEI" ] && [ -f "$DATEI" ] || { echo "Kein Backup gefunden." >&2; exit 1; }
DB=kirmes_restore_test
psql_db() { docker compose exec -T db psql -U kirmes -d "$1" -Atc "$2"; }
psql_db kirmes "DROP DATABASE IF EXISTS $DB" >/dev/null
psql_db kirmes "CREATE DATABASE $DB" >/dev/null
trap 'psql_db kirmes "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
docker compose exec -T db pg_restore -U kirmes -d "$DB" --no-owner --exit-on-error < "$DATEI"
ZAEHL="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'termin' t, count(*) n FROM termin UNION ALL SELECT 'ort', count(*) FROM ort
  UNION ALL SELECT 'festplatz', count(*) FROM festplatz UNION ALL SELECT 'admin', count(*) FROM admin
  UNION ALL SELECT 'mitteilung', count(*) FROM mitteilung) x"
echo "Backup ($DATEI): $(psql_db "$DB" "$ZAEHL")"
echo "Laufend:          $(psql_db kirmes "$ZAEHL")"
echo "✔ Restore-Test erfolgreich (Unterschiede = Änderungen seit dem Backup)"
