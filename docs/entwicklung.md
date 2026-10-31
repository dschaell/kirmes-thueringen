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

## Lokal starten

Voraussetzungen: **Node.js ≥ 26**, Docker (z. B. Rancher Desktop).

```bash
npm install
npm run dev          # PostgreSQL im Container, Migrationen, API (3100) + Website (4321)
npm run db:orte      # einmalig: 3.000+ Thüringer Orte aus OpenStreetMap
npm run db:beispiele # erfundene Beispieltermine (nie auf dem Server)
```

| Befehl                                        | Zweck                                                       |
| --------------------------------------------- | ----------------------------------------------------------- |
| `npm run lint`                                | ESLint, Prettier, Migrationssperre, Schichtenregeln         |
| `npm run typecheck`                           | TypeScript (Core, API, Web)                                 |
| `npm run test:db`                             | eigene Test-Datenbank `kirmes_test` anlegen und migrieren   |
| `npm test` / `npm run test:coverage`          | Unit-, HTTP- und Integrationstests (`TEST_DATABASE_URL`)    |
| `node scripts/upgrade-test.mjs main`          | Update-Test: Migrationen dürfen keine Nutzerdaten verändern |
| `node scripts/website-pruefen.mjs [url]`      | Live-Prüfung (Seiten, Kalender, Sitemap, SEO, Kacheln)      |
| `npm run termine:import -- datei.csv --probe` | Recherche-Tabelle prüfen bzw. einspielen                    |

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
