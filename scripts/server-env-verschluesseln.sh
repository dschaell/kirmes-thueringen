#!/usr/bin/env bash
# Erzeugt die Server-Secrets für den Hetzner-Stack und verschlüsselt sie mit SOPS/age.
#
#   scripts/server-env-verschluesseln.sh <pfad-zu-server-deployments>
#
# - Klartext: .env.server (gitignored, chmod 600) – wird beim ersten Lauf angelegt:
#   DB-Passwörter zufällig, SMTP-Werte aus .env übernommen. Später einfach .env.server
#   bearbeiten und das Skript erneut ausführen.
# - Ergebnis: <server-deployments>/stacks/kirmes/.env.sops (verschlüsselt, darf ins Repo).
#   Verschlüsselt wird nur mit dem öffentlichen age-Key aus .sops.yaml – kein privater Key nötig.
# - Es werden keine Werte ausgegeben, nur Namen und Längen.
set -euo pipefail

DEPLOY=${1:?Pfad zu server-deployments angeben}
cd "$(dirname "$0")/.."
LOKAL=.env
KLAR=.env.server
ZIEL="$DEPLOY/stacks/kirmes/.env.sops"

command -v sops >/dev/null || { echo "sops fehlt: brew install sops age" >&2; exit 1; }
[ -f "$DEPLOY/.sops.yaml" ] || { echo "$DEPLOY/.sops.yaml nicht gefunden" >&2; exit 1; }
umask 077

if [ ! -f "$KLAR" ]; then
  wert() { grep -E "^$1=" "$LOKAL" | head -1 | cut -d= -f2- || true; }
  {
    echo "DOMAIN=kirmeskalender-thueringen.de"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "APP_DB_PASSWORD=$(openssl rand -hex 24)"
    echo "LOG_LEVEL=info"
    echo "RATE_LIMIT_MAX=120"
    echo "RATE_LIMIT_FENSTER_S=60"
    for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM MAIL_AN; do echo "$k=$(wert "$k")"; done
  } > "$KLAR"
  echo "$KLAR angelegt."
fi

echo "Inhalt (nur Namen/Längen):"
grep -vE '^\s*(#|$)' "$KLAR" | awk '{k=substr($0,1,index($0,"=")-1); v=substr($0,index($0,"=")+1); printf "  %-22s %s\n", k, (length(v)>0 ? "gesetzt (" length(v) " Zeichen)" : "LEER")}'

mkdir -p "$(dirname "$ZIEL")"
(cd "$DEPLOY" && sops --encrypt --filename-override stacks/kirmes/.env.sops \
  --input-type dotenv --output-type dotenv /dev/stdin) < "$KLAR" > "$ZIEL.neu"

# Leck-Prüfung: kein Klartextwert darf in der verschlüsselten Datei stehen
while IFS= read -r z; do
  case "$z" in '#'* | '') continue ;; esac
  v=${z#*=}
  if [ ${#v} -ge 8 ] && grep -qF -- "$v" "$ZIEL.neu"; then
    rm -f "$ZIEL.neu"; echo "ABBRUCH: ${z%%=*} steht im Klartext in der Ausgabe" >&2; exit 1
  fi
done < "$KLAR"

mv "$ZIEL.neu" "$ZIEL"
echo "Verschlüsselt: $ZIEL ($(grep -cE '=ENC\[' "$ZIEL") Werte)"
