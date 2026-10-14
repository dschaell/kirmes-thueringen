# Kirmeskalender Thüringen

[![Security & Quality](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml/badge.svg)](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml)

Alle Kirmes-Termine in Thüringen suchen, nach Landkreis filtern und verwalten.
Neuauflage des Thüringer Kirmeskalenders (bisher Unterseite von mauersberger-haarhausen.de/kirmes,
krankheitsbedingt eingestellt).

## Architektur (N-Tier + Clean Architecture)

```
apps/web        Client-Tier   Astro mit Server-Rendering, holt Daten nur über die API
apps/api        Server-Tier   Fastify-API, PostgreSQL-Adapter, Migrationen
packages/core   Fachlogik     Domain + Use Cases – keine Framework-/DB-Abhängigkeiten
db/             Data-Tier     PostgreSQL 17 + PostGIS im Docker-Container, Migrationen, Seed
deploy/         Betrieb       Caddy (HTTPS) und .env-Vorlage für den Server
docs/architecture             arc42-Dokumentation
```

Abhängigkeiten zeigen nur nach innen (`apps → core`). Das prüfen dependency-cruiser und ESLint
bei jedem Lint-Lauf. Details: [docs/architecture](docs/architecture/README.md).

## Schnellstart

Voraussetzungen: Node.js ≥ 22, Docker (z. B. Docker Desktop oder Rancher Desktop).

```bash
npm install
npm run dev        # startet PostgreSQL im Container, migriert, startet API + Website
```

Website: http://localhost:4321 · API: http://localhost:3100/api/v1/termine
Termine einspielen: `npm run db:seed` (Beispieldaten oder lokaler Import, siehe unten).

Alles in Containern wie auf dem Server: `docker compose --profile app up -d --build` → http://localhost:8080
Server-Umzug: [docs/betrieb/server-umzug.md](docs/betrieb/server-umzug.md)

| Befehl                  | Zweck                                                   |
| ----------------------- | ------------------------------------------------------- |
| `npm run lint`          | ESLint, Prettier, Schichtenregeln                       |
| `npm test`              | Unit-, HTTP- und (mit `DATABASE_URL`) Integrationstests |
| `npm run test:coverage` | wie oben, mit Abdeckungs-Schwelle 85 %                  |
| `npm run build`         | Core, API und Web bauen                                 |
| `npm run db:backup`     | Datenbank sichern nach `backups/`                       |
| `npm run db:restore`    | Backup einspielen                                       |

## Qualität und Sicherheit

Die Pipeline [`security-and-quality.yml`](.github/workflows/security-and-quality.yml) prüft jeden
Push und Pull Request: Secret Scanning (TruffleHog) · SAST (Semgrep, eigene SQL-Injection-Regeln) ·
SCA (npm audit, OWASP Dependency-Check) · DAST (OWASP ZAP gegen Web und API) · Lint/Typen ·
Tests mit Coverage-Gate und -Ratchet. Ein Merge ist nur bei grünem **Quality Gate** möglich.

Repository-Einrichtung (Labels, Branch Protection, Backlog): `./scripts/setup-github.sh`

## Daten

Die Termindaten sind **nicht** im Repository, solange die Zustimmung des bisherigen Betreibers
fehlt. CI und frische Klone nutzen `db/seed/termine.beispiel.json`. Lokaler Import der Altdaten:

```bash
curl -sL -o scripts/quelle-2026.html https://www.mauersberger-haarhausen.de/kirmes/kirmes-2026.html
npm run import:alt    # → db/seed/termine.json (per .gitignore ausgeschlossen)
```

## Vor dem Livegang

- [ ] Einverständnis des bisherigen Betreibers zur Datenübernahme
- [ ] Domain registrieren (`apps/web/astro.config.mjs`, `apps/web/public/robots.txt`)
- [ ] Impressum, Datenschutz und Kontaktadresse ausfüllen
- [ ] Offene P0/P1-Issues abarbeiten (Authentifizierung, Frontend auf API, DB-Rollen)
