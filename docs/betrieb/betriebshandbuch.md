# Betriebshandbuch

Für den Server (Docker Compose mit `docker-compose.yml` + `docker-compose.prod.yml`, Caddy davor).
Lokal gelten dieselben Befehle ohne die Prod-Datei. Umzug auf einen neuen Server:
[server-umzug.md](server-umzug.md). E-Mail: [e-mail-brevo.md](e-mail-brevo.md).

> Server und Deployment (GitOps, Secrets, Erststart): siehe [hetzner-gitops.md](hetzner-gitops.md).

## Täglich automatisch

- **Backup:** Der Dienst `backup` sichert die Datenbank täglich per `pg_dump` (14 Tage).
- **Pipeline:** Jeder Pull Request durchläuft Secrets-, Lint-, Test-, SAST-, SCA- und DAST-Prüfung.
- **Dependabot** schlägt Updates vor; erst mergen, wenn die Pipeline grün ist.

## Updates ohne Datenverlust (Issue #59)

Ein Update darf Zugänge (Konten, Passkeys, Rollen, Sitzungen) und Daten der Nutzer nie ändern oder
löschen. Dreifach abgesichert:

1. **Migrations-Sperre** (`npm run lint`, CI): neue Migrationen (> 010) mit `DROP`, `DELETE`,
   `TRUNCATE`, `UPDATE`, `RENAME`, Typänderung oder `SET NOT NULL` schlagen fehl. Ausnahme nur nach
   Rücksprache mit Kommentar `-- datenaenderung-freigegeben: #<issue>`.
2. **Upgrade-Test** (CI, jeder PR): Basis-Stand migrieren, Testdaten aus
   `db/upgrade-test/testdaten.sql` laden, auf den PR-Stand migrieren, jede Zeile vergleichen.
   Lokal: `DATABASE_URL=… node scripts/upgrade-test.mjs main`. Neue Tabellen mit Nutzerdaten dort
   ergänzen.
3. **Sicherung vor jedem Update** (Server): Dienst `sicherung-vor-update` schreibt vor den Migrationen
   `/root/kirmes-backups/vor-update-<Zeitpunkt>.dump` (30 Tage). Scheitert sie, startet das Update
   nicht. Zurückspielen wie unten beschrieben.

## Backup und Wiederherstellung

| Aufgabe                           | Befehl                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup jetzt                      | `./scripts/db-backup.sh` → `backups/kirmes-<Datum>.dump`                                                                                                      |
| **Restore-Test** (monatlich)      | `./scripts/db-restore-test.sh` – spielt das neueste Backup in eine Wegwerf-Datenbank ein und vergleicht Zeilenzahlen; die laufende Datenbank bleibt unberührt |
| Wiederherstellen (ersetzt Daten!) | `./scripts/db-restore.sh backups/kirmes-<Datum>.dump` – fragt nach                                                                                            |

Nach einer Wiederherstellung `docker compose … run --rm migrate` laufen lassen (fehlende
Migrationen, Login der API-Rolle). Backups zusätzlich **außerhalb** des Servers aufbewahren.

## Secrets wechseln

Alle Secrets stehen nur in `.env` auf dem Server (`chmod 600`), nie im Repository.

| Secret                    | Wann wechseln                      | Vorgehen                                                                                                                                           |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_DB_PASSWORD`         | jährlich, bei Verdacht sofort      | neuen Wert in `.env`, dann `run --rm migrate` (setzt das Passwort der Rolle `kirmes_app`) und `up -d api`                                          |
| `POSTGRES_PASSWORD`       | bei Verdacht                       | `docker compose exec db psql -U kirmes -c "ALTER ROLE kirmes PASSWORD '…'"`, dann `.env` anpassen und `up -d`                                      |
| `SMTP_PASS` (Brevo)       | bei Verdacht, beim Personalwechsel | in Brevo neuen SMTP-Schlüssel erzeugen, alten löschen, `.env`, `up -d api`                                                                         |
| Redaktions-Zugänge        | bei Verdacht                       | Mitglied unter `/admin/mitglieder` entfernen (Sitzungen + Passkeys weg) und neu einladen; alle Sitzungen beenden: `npm run admin -- abmelden-alle` |
| Passkeys                  | Gerät verloren                     | Redaktion → Passkeys → Löschen                                                                                                                     |
| Bearbeitungslink einer KG | Link weitergegeben/verloren        | Redaktion → Bearbeitungslinks → Sperren, neuen Link erstellen                                                                                      |

## Störungen

### Viele 503 („Die Termine sind gerade nicht erreichbar“)

1. `docker compose ps` – laufen `db`, `api`, `web`? Healthchecks?
2. `docker compose logs --tail 200 api` – „Datenbank nicht erreichbar“? → `docker compose logs db`
3. Platte voll? `df -h` (Backups, Docker-Images: `docker system prune` mit Bedacht)
4. Datenbank neu starten: `docker compose restart db`; die API meldet sich nach dem Healthcheck
   von selbst zurück (Retry-After 30 s).
5. Daten beschädigt → letztes Backup per `db-restore.sh` (vorher `db-restore-test.sh`).

### Viele 429 („Zu viele Anfragen“)

Rate-Limit der Website (`RATE_LIMIT_MAX`, Standard 120 Seiten/Minute und IP). Bei echtem Andrang
(z. B. Kirmeswochenende, Link in einer großen Gruppe) Wert in `.env` erhöhen und `up -d web`.
Bei Scraping: IP im Log von Caddy prüfen.

### Meldungen kommen nicht an

Brevo → Transaktional → Logs: zugestellt? Abgewiesen? `docker compose logs api | grep Meldung`
(„konnte nicht versendet werden“ → SMTP-Schlüssel, Absender-Domain in Brevo prüfen).

### Sicherheitsvorfall (Verdacht auf Einbruch)

1. Admin-Sitzungen beenden (`npm run admin -- abmelden <email>`), alle Bearbeitungslinks sperren
2. Alle Secrets oben wechseln, Backup sichern (Beweis), Logs sichern
3. `aenderungsprotokoll` prüfen: wer hat was wann geändert
4. Bei personenbezogenen Daten: Meldepflicht nach Art. 33 DSGVO (72 Stunden) prüfen
