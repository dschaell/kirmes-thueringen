#!/bin/sh
# Einstieg der Werkzeug-Container: installiert die Abhängigkeiten, wenn sich package-lock.json geändert
# hat, und führt dann den übergebenen Befehl aus (Issue #445).
set -eu
cd /app
stempel=node_modules/.lock-pruefsumme
summe="$(cksum package-lock.json | cut -d' ' -f1-2)"
if [ ! -f "$stempel" ] || [ "$(cat "$stempel")" != "$summe" ]; then
  npm ci --no-audit --no-fund
  echo "$summe" > "$stempel"
fi
[ -f .env ] || cp .env.example .env 2>/dev/null || true
exec "$@"
