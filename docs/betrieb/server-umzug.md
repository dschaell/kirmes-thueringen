# Betrieb: lokal entwickeln, später auf einen Server umziehen

Datenbank, API und Website laufen in Docker-Containern. Lokal und auf dem Server wird **dieselbe**
`docker-compose.yml` verwendet; auf dem Server kommt `docker-compose.prod.yml` hinzu
(HTTPS, keine offenen Ports außer 80/443, tägliche Backups).

```
                    lokal (Entwicklung)                         Server (Produktion)
 Browser ──► Website :4321 (npm run dev)          Browser ──► Caddy :443 (HTTPS, Let's Encrypt)
               │                                                   │
               ▼                                                   ▼
             API :3100 (npm run dev)                            web :4321 (Container)
               │                                                   │  internes Docker-Netz
               ▼                                                   ▼
             db :5432 (Docker, nur 127.0.0.1)                   api :3100 ──► db :5432
                                                                backup ──► ./backups (täglich)
```

## 1. Lokal

| Aufgabe                                     | Befehl                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Alles starten (DB im Container, Rest lokal) | `npm run dev` → http://localhost:4321                                |
| Nur die Datenbank starten / stoppen         | `npm run db:up` / `npm run db:stop`                                  |
| Orte laden / Beispieltermine                | `npm run db:orte` / `npm run db:beispiele`                           |
| Recherche einspielen                        | `npm run termine:import -- datei.csv`                                |
| Komplett in Containern (wie Server)         | `docker compose --profile app up -d --build` → http://localhost:8080 |
| Backup erstellen                            | `npm run db:backup` → `backups/kirmes-<Datum>.dump`                  |
| Backup einspielen                           | `npm run db:restore -- backups/kirmes-….dump`                        |

- Die Datenbank-Daten liegen im Docker-Volume `kirmes_db-daten` und überleben Neustarts.
- Der Container startet mit Docker automatisch wieder (`restart: unless-stopped`).
- Port 5432 ist nur vom eigenen Rechner aus erreichbar (`127.0.0.1`).

## 2. Server vorbereiten (einmalig)

**Empfehlung:** kleiner VPS mit 2 vCPU / 4 GB RAM / 40 GB SSD, Ubuntu 24.04 LTS, **x86/amd64**
(z. B. Hetzner CX22, netcup VPS). Kosten ca. 4–6 € pro Monat.

> **ARM-Server** (z. B. Hetzner CAX): Das offizielle PostGIS-Image gibt es nur für amd64.
> Dann `DB_PLATFORM=linux/arm64` setzen und in beiden Compose-Dateien ein Multi-Arch-Image
> (z. B. `imresamu/postgis:17-3.5-alpine`) eintragen.

```bash
# als root auf dem Server
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh            # Docker + Compose-Plugin
adduser --disabled-password kirmes && usermod -aG docker kirmes
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw --force enable
```

**DNS:** A-Eintrag (und ggf. AAAA) der Domain sowie `www.` auf die Server-IP zeigen lassen.

## 3. Anwendung installieren

```bash
# als Benutzer kirmes
git clone https://github.com/dschaell/kirmes-thueringen.git /opt/kirmes && cd /opt/kirmes
cp deploy/.env.server.example .env && chmod 600 .env
nano .env    # DOMAIN und POSTGRES_PASSWORD (openssl rand -hex 24) eintragen
docker compose up -d --build --wait
```

`COMPOSE_FILE` in der `.env` sorgt dafür, dass `docker compose` auf dem Server automatisch auch
`docker-compose.prod.yml` verwendet. Caddy holt beim ersten Start das HTTPS-Zertifikat.

## 4. Daten vom lokalen Rechner auf den Server umziehen

```bash
# lokal
npm run db:backup                                   # → backups/kirmes-2026-10-14-1530.dump
scp backups/kirmes-2026-10-14-1530.dump kirmes@SERVER:/opt/kirmes/backups/

# auf dem Server
cd /opt/kirmes && ./scripts/db-restore.sh backups/kirmes-2026-10-14-1530.dump
```

Danach ist die Website unter `https://DOMAIN` mit denselben Daten erreichbar.

Alternativ auf einem leeren Server: `docker compose run --rm migrate node apps/api/dist/infrastructure/postgres/orte.js`
lädt das Ortsverzeichnis; Termine dann per Recherche-Import oder über die Links der Kirmesgesellschaften.

## 5. Updates einspielen

```bash
cd /opt/kirmes && git pull && docker compose up -d --build --wait
```

Datenbank-Migrationen laufen dabei automatisch (Dienst `migrate`, bevor die API startet).

## 6. Redaktionszugang einrichten

```bash
cd /opt/kirmes
docker compose run --rm -it migrate node apps/api/dist/infrastructure/postgres/admin-cli.js anlegen deine@email.de
```

Passwort festlegen (mind. 12 Zeichen), dann den angezeigten Schlüssel in eine Authenticator-App
eintragen (Google Authenticator, Authy, 1Password …). Anmeldung unter `https://DOMAIN/admin`.

## 6a. Bearbeitungslinks für Kirmesgesellschaften

Am einfachsten über den Admin-Bereich (`/admin/links`). Alternativ per Befehl:

```bash
cd /opt/kirmes
docker compose run --rm -e WEBSITE_URL=https://$DOMAIN migrate \
  node apps/api/dist/infrastructure/postgres/links.js erstellen <orts-slug> "Kirmesgesellschaft …"
docker compose run --rm migrate node apps/api/dist/infrastructure/postgres/links.js liste
docker compose run --rm migrate node apps/api/dist/infrastructure/postgres/links.js sperren <id>
```

Der Orts-Slug steht in der Adresse der Ortsseite (`/orte/<slug>`). Der Link wird nur einmal angezeigt –
direkt per E-Mail oder Messenger an die Kirmesgesellschaft weitergeben. Gesperrte Links sind sofort ungültig.

## 7. Backups

- Der Dienst `backup` erstellt täglich `backups/kirmes-<Datum>.dump` und löscht Sicherungen nach 14 Tagen.
- **Wichtig:** Backups zusätzlich vom Server wegkopieren (z. B. `rsync` auf einen Speicher oder ein
  Hetzner Storage Box). Ein Backup auf derselben Festplatte schützt nicht vor Server-Ausfall.
- Wiederherstellung regelmäßig testen: Backup lokal mit `npm run db:restore` einspielen.

## 8. Prüfliste vor dem Livegang

- [ ] Eigene Termine eingespielt (`docs/betrieb/recherche.md`), Links an die ersten Kirmesgesellschaften verschickt
- [ ] Impressum, Datenschutz und Kontaktadresse ausgefüllt
- [ ] `site` in `apps/web/astro.config.mjs` und `apps/web/public/robots.txt` auf die echte Domain gesetzt
- [ ] `POSTGRES_PASSWORD` stark und nur in `/opt/kirmes/.env` (chmod 600)
- [ ] Externe Kopie der Backups eingerichtet
- [ ] Offene P0-Issues erledigt (Authentifizierung für die Verwaltung)
