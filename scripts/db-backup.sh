#!/usr/bin/env bash
# Sichert die Datenbank aus dem Docker-Container in backups/kirmes-<Datum>.dump (pg_dump, Custom-Format).
# Funktioniert lokal und auf dem Server (dort steuert COMPOSE_FILE in .env die Compose-Dateien).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
ZIEL="backups/kirmes-$(date +%F-%H%M).dump"
docker compose exec -T db pg_dump -U kirmes -d kirmes --format=custom > "$ZIEL"
echo "✔ Backup: $ZIEL ($(du -h "$ZIEL" | cut -f1))"
