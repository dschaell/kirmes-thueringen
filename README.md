# Kirmeskalender Thüringen

[![Security & Quality](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml/badge.svg)](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml)

Alle Kirmessen in Thüringen an einem Ort: suchen, nach Landkreis, Ort und Art filtern, aufs Handy
abonnieren – gepflegt von der Redaktion, den Kirmesgesellschaften und allen, die Termine melden.

**Live:** <https://kirmeskalender-thueringen.de>

## Funktionen

- **Termine** – Liste nach Tag und Uhrzeit, Filter nach Zeitraum, Landkreis, Art (Kirmestanz,
  Kindertanz, Gottesdienst, Frühschoppen, Ständchen, Sonstiges) und „nur bestätigte“; Ortsseiten,
  Landkreisseiten, Karte
- **Terminseite** – Programm, Band bzw. Chor, Pfarrer/in, Essen & Getränke, Muttizettel-Hinweis und
  -Vorlage, Route (nur mit hinterlegtem Kartenpunkt oder zur Ortsmitte), Kalender-Eintrag, Teilen
- **Kalender-Abo** (`/kalender.ics`) für ganz Thüringen, Landkreis oder Ort – Änderungen kommen
  automatisch an
- **Termin melden** – Assistent in drei Schritten ohne Anmeldung, inkl. optionalem
  Google-Maps-Link (geprüft, nur Koordinaten gespeichert); die Redaktion prüft jeden Vorschlag
- **Korrektur melden** auf jeder Terminseite
- **Plätze** (Kirche, Festzelt …) mit Kartenpunkt je Ort – per Google-Maps-Link, Name wird aus dem
  Link übernommen

## Redaktion

Unter `/admin` (Footer „Anmelden (Redaktion)“), Anmeldung **nur mit Passkey** – ohne Passwort
(ADR 023).

| Rolle                  | Darf                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **Kirmesgesellschaft** | nur der eigene Ort: Termine, Plätze inkl. Kartenlinks, Vorschläge und Korrekturen         |
| **Redaktion**          | alle Termine, Orte, Plätze und Kartenlinks, Vorschläge und Korrekturen prüfen, Import     |
| **Admin**              | zusätzlich Mitglieder einladen, Rollen ändern, selbst angelegte Orte löschen, Sicherungen |

- Erster Admin: `/admin/einrichten` → Link ans Redaktionspostfach → Name + Passkey
- Mitmachen: `/redaktion-mitmachen` → Anfrage per Mail → Admin lädt unter „Redaktion &
  Einladungen“ ein – Kirmesgesellschaften mit Rolle „Kirmesgesellschaft“ und ihrem Ort
- „Kirmes eintragen“: ganzes Programm auf einmal, fehlende Orte direkt mit anlegen, Kirmes vom
  Vorjahr übernehmen; Tabellen-Import unter „Mehr → Termine importieren“

Kirmesgesellschaften können zusätzlich über einen **persönlichen Bearbeitungslink** (ohne Konto)
ihre Termine und Festplätze pflegen: Redaktion → „Mehr → Bearbeitungslinks“.

## Architektur

```
apps/web        Astro (SSR) – holt Daten nur über die API, strenge CSP
apps/api        Fastify-API, PostgreSQL-Adapter, Migrationen
apps/backup     Sicherungs-Container (täglich, optional verschlüsselt außer Haus)
packages/core   Fachlogik (Domain + Use Cases) – ohne Framework-/DB-Abhängigkeiten
db/             Migrationen, Ortsverzeichnis (OpenStreetMap), Testdaten für Upgrade-Tests
docs/           arc42-Architektur, ADRs, Betrieb, Reviews
```

Abhängigkeiten zeigen nur nach innen (`apps → core`); dependency-cruiser prüft das bei jedem Lint.
Details: [docs/architecture](docs/architecture/README.md).

## Entwicklung

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

**Regeln:** Migrationen sind nur ergänzend (Sperre in `scripts/migrationen-pruefen.mjs`;
Datenänderungen nur mit Freigabe-Kommentar `-- datenaenderung-freigegeben: #<issue>`). Tests laufen
nie gegen die Arbeitsdatenbank. Jede Arbeit beginnt mit einem Issue, PRs schließen es.

## Qualität und Sicherheit

[`security-and-quality.yml`](.github/workflows/security-and-quality.yml) prüft jeden Pull Request:
Secret Scanning (TruffleHog) · SAST (Semgrep, eigene SQL-Injection-Regeln) · SCA (npm audit,
OSV-Scanner) · DAST (OWASP ZAP) · Lint/Typen · Tests mit Coverage-Gate und **Ratchet** (Abdeckung
darf nicht sinken). Gemergt wird nur bei grünem **Quality Gate**.

Täglich: [`website-pruefung.yml`](.github/workflows/website-pruefung.yml) (Inhalte, Lighthouse,
SEO); [`erreichbarkeit.yml`](.github/workflows/erreichbarkeit.yml) als Rückfallebene – für
verlässlichen Ausfall-Alarm einen externen Monitor nutzen (siehe Betrieb).

## Betrieb

Läuft auf einem geteilten Hetzner-Server per GitOps (Stack in `intershopper/server-deployments`).
Deploy, Secrets, Sicherungen, Wiederherstellung und Überwachung:
[docs/betrieb/hetzner-gitops.md](docs/betrieb/hetzner-gitops.md).

Ortsdaten © OpenStreetMap-Mitwirkende (ODbL), siehe [db/seed/ORTE-LIZENZ.md](db/seed/ORTE-LIZENZ.md).
