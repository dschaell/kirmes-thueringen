#!/usr/bin/env bash
# Spielt ein Backup in die Datenbank im Docker-Container ein (ersetzt vorhandene Daten!).
#   ./scripts/db-restore.sh backups/kirmes-2026-10-14-1200.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DATEI="${1:?Aufruf: $0 <backup.dump>}"
[ -f "$DATEI" ] || { echo "Datei $DATEI nicht gefunden" >&2; exit 1; }
read -r -p "Alle Daten in der Datenbank durch $DATEI ersetzen? [ja/N] " antwort
[ "$antwort" = "ja" ] || { echo "Abgebrochen."; exit 1; }
docker compose up -d --wait db
docker compose exec -T db pg_restore -U kirmes -d kirmes --clean --if-exists --no-owner --single-transaction < "$DATEI"
echo "✔ Wiederhergestellt aus $DATEI"
