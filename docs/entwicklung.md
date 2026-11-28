# Entwicklung

Interne Notizen zum Arbeiten am Kirmeskalender. Die Projektvorstellung steht im
[README](../README.md), die Architektur unter [docs/architecture](architecture/README.md).

## Aufbau

```
apps/web        Astro (SSR) – holt Daten nur über die API, strenge CSP
apps/api        Fastify-API, PostgreSQL-Adapter, Migrationen
apps/backup     Sicherungs-Container (täglich, optional verschlüsselt außer Haus)
packages/core   Fachlogik (Domain + Use Cases) – ohne Framework-/DB-Abhängigkeiten
db/             Migrationen, Ortsverzeichnis (OpenStreetMap), Testdaten für Upgrade-Tests
docs/           arc42-Architektur, ADRs, Betrieb, Reviews
```

Abhängigkeiten zeigen nur nach innen (`apps → core`); dependency-cruiser prüft das bei jedem Lint.

## Lokal starten (nur Docker)

Voraussetzung: Docker (z. B. Rancher Desktop). **Kein Node.js nötig**, alles läuft in Containern
([ADR 025](architecture/adr/025-docker-only-entwicklung-und-pruefung.md)).

```bash
docker compose --profile dev up                         # PostgreSQL, Migrationen, API (3100) + Website (4321)
docker compose run --rm tools npm run db:orte           # einmalig: 3.000+ Thüringer Orte aus OpenStreetMap
docker compose run --rm tools npm run db:beispiele      # erfundene Beispieltermine (nie auf dem Server)
```

Der erste Start installiert die Abhängigkeiten in Docker-Volumes und dauert einige Minuten.

| Befehl                                                                      | Zweck                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docker compose run --rm check`                                             | Quality Gate lokal: Lint, Typen, Build, Tests mit Mindestabdeckung |
| `docker compose run --rm tools npm run lint`                                | ESLint, Prettier, Migrationssperre, Schichtenregeln                |
| `docker compose run --rm tools npm run format`                              | Prettier schreibt die Formatierung                                 |
| `docker compose run --rm tools npm run typecheck`                           | TypeScript (Core, API, Web)                                        |
| `docker compose run --rm tools node scripts/upgrade-test.mjs main`          | Update-Test: Migrationen dürfen keine Nutzerdaten verändern        |
| `docker compose run --rm tools node scripts/website-pruefen.mjs [url]`      | Live-Prüfung (Seiten, Kalender, Sitemap, SEO, Kacheln)             |
| `docker compose run --rm tools npm run termine:import -- datei.csv --probe` | Recherche-Tabelle prüfen bzw. einspielen                           |
| `docker compose run --rm tools npm run admin -- …`                          | Redaktionskonten per Kommandozeile                                 |

`check` läuft nie gegen die Arbeitsdatenbank, sondern gegen die Wegwerf-Datenbank `kirmes_test`
(Dienst `db-test`, im Arbeitsspeicher). Der Upgrade-Test legt seine Datenbank `kirmes_upgrade` in der
Arbeitsdatenbank-Instanz an, nie in `kirmes`.

## Regeln

- Jede Arbeit beginnt mit einem Issue, der Pull Request schließt es.
- Migrationen sind nur ergänzend (Sperre in `scripts/migrationen-pruefen.mjs`); Datenänderungen nur
  mit Freigabe-Kommentar `-- datenaenderung-freigegeben: #<issue>`.
- Tests laufen nie gegen die Arbeitsdatenbank.
- Gemergt wird nur bei grünem **Quality Gate** (siehe
  [`security-and-quality.yml`](../.github/workflows/security-and-quality.yml)); die Testabdeckung
  darf nicht sinken.

## Redaktion einrichten

- Erster Admin: `/admin/einrichten` → Link ans Redaktionspostfach → Name + Passkey.
- Mitmachen: `/redaktion-mitmachen` → Anfrage unter „Anfragen“ → Admin nimmt an (Einladungslink geht
  per Mail an die Person) oder lehnt ab.
- Bearbeitungslinks (Pflege ohne Konto) gibt es nicht mehr (Issue #355) – Kirmesgesellschaften
  pflegen ihren Ort mit eigenem Konto und Passkey.

## Betrieb

Läuft auf einem geteilten Hetzner-Server per GitOps (Stack in `intershopper/server-deployments`).
Deploy, Secrets, Sicherungen, Wiederherstellung und Überwachung:
[betrieb/hetzner-gitops.md](betrieb/hetzner-gitops.md).

Täglich: [`website-pruefung.yml`](../.github/workflows/website-pruefung.yml) (Inhalte, Lighthouse,
SEO); [`erreichbarkeit.yml`](../.github/workflows/erreichbarkeit.yml) als Rückfallebene.
