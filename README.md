# Kirmeskalender Thüringen

[![Security & Quality](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml/badge.svg)](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml)

Alle Kirmes-Termine in Thüringen suchen, nach Landkreis filtern und verwalten.
Neuauflage des Thüringer Kirmeskalenders (bisher Unterseite von mauersberger-haarhausen.de/kirmes,
krankheitsbedingt eingestellt).

## Architektur (N-Tier + Clean Architecture)

```
apps/web        Client-Tier   Astro (statisch), nginx mit strenger CSP
apps/api        Server-Tier   Fastify-API, PostgreSQL-Adapter, Migrationen
packages/core   Fachlogik     Domain + Use Cases – keine Framework-/DB-Abhängigkeiten
db/             Data-Tier     SQL-Migrationen (PostgreSQL 17 + PostGIS), Seed-Daten
docs/architecture             arc42-Dokumentation
```

Abhängigkeiten zeigen nur nach innen (`apps → core`). Das prüfen dependency-cruiser und ESLint
bei jedem Lint-Lauf. Details: [docs/architecture](docs/architecture/README.md).

## Schnellstart

```bash
npm install
docker compose up -d --wait db
export DATABASE_URL=postgres://kirmes:kirmes_dev_only@127.0.0.1:5432/kirmes
npm run db:migrate && npm run db:seed
npm run dev -w @kirmes/api      # http://localhost:3000/api/v1/termine
npm run dev -w @kirmes/web      # http://localhost:4321
```

Alles in Containern: `docker compose up -d --build --wait` (Web :8080, API :3000).

| Befehl                  | Zweck                                                   |
| ----------------------- | ------------------------------------------------------- |
| `npm run lint`          | ESLint, Prettier, Schichtenregeln                       |
| `npm test`              | Unit-, HTTP- und (mit `DATABASE_URL`) Integrationstests |
| `npm run test:coverage` | wie oben, mit Abdeckungs-Schwelle 85 %                  |
| `npm run build`         | Core, API und Web bauen                                 |

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
