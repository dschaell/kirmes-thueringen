#!/bin/sh
# Tägliche Sicherung der Kirmes-Datenbank (Issue #45).
#
# Umgebung:
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD   Datenbank (wie bisher)
#   SICHERUNG_TAGE        Aufbewahrung lokal (Standard 14)
#   AGE_EMPFAENGER        öffentlicher age-Schlüssel (age1…) – nur damit wird außer Haus gesichert
#   OFFSITE_ZIEL          rclone-Ziel, z. B. "offsite:kirmes" (Zugang per RCLONE_CONFIG_OFFSITE_*)
#   OFFSITE_TAGE          Aufbewahrung außer Haus (Standard 30)
#   EINMAL=ja             nur einen Durchlauf (Tests, Wiederherstellungsprobe)
#
# Der Server kennt nur den öffentlichen Schlüssel: Was außer Haus liegt, kann dort niemand lesen.
# /backups/status.json zeigt der Redaktion, wann zuletzt gesichert wurde – ohne Serverzugang.
set -u
ZIEL=/backups
TAGE="${SICHERUNG_TAGE:-14}"
OFFSITE_TAGE="${OFFSITE_TAGE:-30}"
# Dumps nur für root lesbar; die API (Benutzer node) braucht nur Namen, Größen und status.json.
umask 077
chmod 0755 "$ZIEL" 2>/dev/null || true

status() {
  # $1 lokal-ok/-fehler, $2 Datei, $3 offsite-status, $4 offsite-meldung
  jq -n --arg zeit "$(date -u +%FT%TZ)" --arg datei "$2" --arg lokal "$1" \
    --argjson groesse "$( [ -f "$ZIEL/$2" ] && stat -c %s "$ZIEL/$2" || echo 0)" \
    --arg offsite "$3" --arg meldung "$4" \
    --argjson anzahl "$(ls "$ZIEL"/kirmes-*.dump 2>/dev/null | wc -l)" \
    '{zeit:$zeit, lokal:$lokal, datei:$datei, groesse:$groesse, anzahl:$anzahl, offsite:$offsite, meldung:$meldung}' \
    > "$ZIEL/status.json.neu" && chmod 0644 "$ZIEL/status.json.neu" \
    && mv "$ZIEL/status.json.neu" "$ZIEL/status.json"
}

sichere() {
  heute="$(date +%F)"
  datei="kirmes-$heute.dump"
  if ! pg_dump --format=custom --file="$ZIEL/$datei.teil"; then
    rm -f "$ZIEL/$datei.teil"
    status fehler "$datei" aus "pg_dump fehlgeschlagen"
    echo "✖ Sicherung $datei fehlgeschlagen" >&2
    return 1
  fi
  mv "$ZIEL/$datei.teil" "$ZIEL/$datei"
  echo "$heute" > "$ZIEL/.letzte"
  find "$ZIEL" -name 'kirmes-*.dump' -mtime +"$TAGE" -delete
  echo "✔ Sicherung $datei ($(stat -c %s "$ZIEL/$datei") Bytes)"

  if [ -n "${AGE_EMPFAENGER:-}" ] && [ -n "${OFFSITE_ZIEL:-}" ]; then
    tmp="$(mktemp)"
    if age -r "$AGE_EMPFAENGER" -o "$tmp" "$ZIEL/$datei" \
      && rclone copyto -q --retries 3 "$tmp" "$OFFSITE_ZIEL/$datei.age" \
      && rclone delete -q --min-age "${OFFSITE_TAGE}d" --include 'kirmes-*.dump.age' "$OFFSITE_ZIEL"; then
      status ok "$datei" ok "außer Haus gesichert"
      echo "✔ außer Haus: $OFFSITE_ZIEL/$datei.age"
    else
      status ok "$datei" fehler "Upload außer Haus fehlgeschlagen"
      echo "✖ Upload außer Haus fehlgeschlagen" >&2
    fi
    rm -f "$tmp"
  else
    status ok "$datei" aus "außer Haus noch nicht eingerichtet"
  fi
}

while true; do
  if [ "$(date +%F)" != "$(cat "$ZIEL/.letzte" 2>/dev/null)" ]; then
    sichere || true
  fi
  [ "${EINMAL:-}" = "ja" ] && exit 0
  sleep 3600
done
