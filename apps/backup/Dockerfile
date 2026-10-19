# Tägliche Datenbanksicherung (Issue #45): pg_dump, 14 Tage Aufbewahrung, optional verschlüsselt außer
# Haus (age + rclone, erst aktiv mit AGE_EMPFAENGER und OFFSITE_ZIEL), Status für die Redaktion.
FROM postgres:17-alpine
RUN apk add --no-cache age rclone jq
# Zugang zum Ziel kommt nur aus Umgebungsvariablen (RCLONE_CONFIG_OFFSITE_*), keine Datei nötig
ENV RCLONE_CONFIG=/dev/null
COPY sicherung.sh /usr/local/bin/sicherung.sh
RUN chmod 0755 /usr/local/bin/sicherung.sh
# Standard ohne Root. Im Stack läuft der Dienst als uid 0, weil /root/kirmes-backups root gehört und
# die Dumps nur für root lesbar bleiben sollen – dort aber ohne Capabilities, read-only und mit
# no-new-privileges (siehe server-deployments/stacks/kirmes).
ENV RCLONE_CACHE_DIR=/tmp/rclone
USER postgres
ENTRYPOINT ["/usr/local/bin/sicherung.sh"]
