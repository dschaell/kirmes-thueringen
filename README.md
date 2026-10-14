# Kirmeskalender Thüringen

[![Security & Quality](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml/badge.svg)](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml)

Alle Kirmes-Termine in Thüringen suchen, nach Landkreis filtern und verwalten – recherchiert und
gepflegt von der Redaktion und den Kirmesgesellschaften selbst.

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

Beim ersten Start Ortsverzeichnis und Beispieltermine laden:

```bash
npm run db:orte        # 3.000+ Thüringer Orte aus OpenStreetMap
npm run db:beispiele   # erfundene Beispieltermine zum Ausprobieren (nicht auf dem Server)
```

Alles in Containern wie auf dem Server: `docker compose --profile app up -d --build` → http://localhost:8080
Server-Umzug: [docs/betrieb/server-umzug.md](docs/betrieb/server-umzug.md)

| Befehl                   | Zweck                                                   |
| ------------------------ | ------------------------------------------------------- |
| `npm run lint`           | ESLint, Prettier, Schichtenregeln                       |
| `npm test`               | Unit-, HTTP- und (mit `DATABASE_URL`) Integrationstests |
| `npm run test:coverage`  | wie oben, mit Abdeckungs-Schwelle 85 %                  |
| `npm run build`          | Core, API und Web bauen                                 |
| `npm run db:backup`      | Datenbank sichern nach `backups/`                       |
| `npm run termine:import` | Recherche-Tabelle (CSV) einspielen                      |
| `npm run link`           | Bearbeitungslinks erstellen / auflisten / sperren       |
| `npm run db:restore`     | Backup einspielen                                       |

## Qualität und Sicherheit

Die Pipeline [`security-and-quality.yml`](.github/workflows/security-and-quality.yml) prüft jeden
Push und Pull Request: Secret Scanning (TruffleHog) · SAST (Semgrep, eigene SQL-Injection-Regeln) ·
SCA (npm audit, OWASP Dependency-Check) · DAST (OWASP ZAP gegen Web und API) · Lint/Typen ·
Tests mit Coverage-Gate und -Ratchet. Ein Merge ist nur bei grünem **Quality Gate** möglich.

Repository-Einrichtung (Labels, Branch Protection, Backlog): `./scripts/setup-github.sh`

## Redaktion (Admin-Bereich)

Unter `/admin` verwaltest du als Betreiber alles: Termine aller Orte (mit Recherche-Assistent für
Texte aus Instagram/Facebook), Mitteilungen (erscheinen einmal als Hinweis für Besucher), Orte und
Bearbeitungslinks. Zugang nur mit Passwort **und** Einmalcode aus einer Authenticator-App.

```bash
npm run admin -- anlegen deine@email.de      # Passwort festlegen, Schlüssel in die Authenticator-App
npm run admin -- passwort deine@email.de     # Passwort ändern
npm run admin -- zweiter-faktor deine@email.de   # neues Handy / App neu einrichten
```

## Festplätze: Bearbeitungslinks für Kirmesgesellschaften

Kirmesgesellschaften tragen ihren Festplatz selbst auf der Karte ein – über einen persönlichen Link
(ohne Konto, ohne Passwort). Die Route-Knöpfe (Google Maps / Apple Karten) führen dann exakt dorthin.

```bash
npm run link -- erstellen muehlberg "Kirmesgesellschaft Mühlberg"   # Link wird einmalig angezeigt
npm run link -- liste
npm run link -- sperren 3
```

Auf dem Server: `docker compose run --rm migrate node apps/api/dist/infrastructure/postgres/links.js erstellen …`
(mit `WEBSITE_URL=https://<domain>` für den richtigen Link).

## Termine einpflegen

Der Kalender enthält nur eigene Recherche und Einträge der Kirmesgesellschaften:

```bash
npm run termine:import -- meine-recherche.csv --probe   # Recherche-Tabelle prüfen
npm run termine:import -- meine-recherche.csv           # einspielen
```

Vorlage und Regeln: [docs/betrieb/recherche.md](docs/betrieb/recherche.md). Ortsdaten
© OpenStreetMap-Mitwirkende (ODbL), siehe [db/seed/ORTE-LIZENZ.md](db/seed/ORTE-LIZENZ.md).

## Vor dem Livegang

- [ ] Genug eigene Termine für den Start (Recherche + Links an Kirmesgesellschaften)
- [ ] Domain registrieren (`apps/web/astro.config.mjs`, `apps/web/public/robots.txt`)
- [ ] Impressum, Datenschutz und Kontaktadresse ausfüllen
- [ ] Offene P0/P1-Issues abarbeiten (Authentifizierung, Frontend auf API, DB-Rollen)
