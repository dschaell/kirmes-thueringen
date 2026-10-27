# Kirmeskalender Thüringen

[![Security & Quality](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml/badge.svg)](https://github.com/dschaell/kirmes-thueringen/actions/workflows/security-and-quality.yml)

Alle Kirmessen in Thüringen an einem Ort: suchen, nach Landkreis, Ort und Art filtern, aufs Handy
abonnieren – gepflegt von der Redaktion, den Kirmesgesellschaften und allen, die Termine melden.

**Live:** <https://kirmeskalender-thueringen.de>

## Warum es diesen Kalender gibt

Kirmes ist in Thüringen von Ostern bis in den November fast jedes Wochenende irgendwo – aber wann
wo gefeiert wird, steht verstreut in Insta-Storys, WhatsApp-Gruppen, Amtsblättern und auf Plakaten
an der Bushaltestelle. Wer nicht im richtigen Ort wohnt oder der richtigen Gruppe folgt, verpasst
es. Einen früheren Kirmeskalender für die Region gab es, er wurde aber nicht fortgeführt – seitdem
fehlte ein Ort, an dem alle Termine zusammenstehen.

Der Kalender soll diese Lücke schließen:

- **Für Besucher:** auf einen Blick sehen, wo heute und am Wochenende Kirmes ist – mit Uhrzeit,
  Band, Muttizettel-Hinweis und Route direkt zum Festzelt oder Saal, auch aufs Handy abonnierbar.
- **Für Kirmesgesellschaften:** ihre Kirmes kostenlos sichtbar machen und selbst pflegen, statt
  jedes Jahr neu Aushänge zu verteilen – und Gäste aus den Nachbarorten erreichen.
- **Für das Brauchtum:** Kirmes lebt davon, dass Leute kommen. Je leichter sie zu finden ist, desto
  besser für die Vereine, die sie jedes Jahr auf die Beine stellen.

Kostenlos, ohne Werbung, ohne Tracking. Gebaut und betrieben von Ryan Dustin Schällert aus Elleben
im Ilm-Kreis; die Termine kommen von der Redaktion, den Kirmesgesellschaften und allen, die eine
Kirmes melden.

## Funktionen

- **Startseite** – was heute und bis Sonntag los ist; alle weiteren Termine unter „Termine“
- **Termine** – Liste nach Tag und Uhrzeit, Filter nach Zeitraum, Landkreis, Art (Kirmestanz,
  Party/Disco, Kindertanz, Gottesdienst, Frühschoppen, Ständchen, Sonstiges) und „nur bestätigte“;
  Ortsseiten, Landkreisseiten, Karte, „Orte A–Z“ mit „Heute Kirmes in …“
- **„bestätigt“** – nur Termine, die die Kirmesgesellschaft selbst eingetragen oder bestätigt hat;
  alles andere stammt aus öffentlichen Ankündigungen
- **Terminseite** – Programm, Band bzw. Chor, Pfarrer/in, Essen & Getränke, Muttizettel-Hinweis und
  -Vorlage, Route (nur mit hinterlegtem Kartenpunkt oder zur Ortsmitte), Kalender-Eintrag, Teilen
- **Kalender-Abo** (`/kalender.ics`) für ganz Thüringen, Landkreis oder Ort – Änderungen kommen
  automatisch an
- **Termin melden** – Assistent in drei Schritten ohne Anmeldung, inkl. optionalem
  Google-Maps-Link (geprüft, nur Koordinaten gespeichert); die Redaktion prüft jeden Vorschlag
- **Korrektur melden** auf jeder Terminseite
- **Plätze** (Kirche, Festzelt …) mit Kartenpunkt je Ort – per Google-Maps-Link, Name wird aus dem
  Link übernommen
- **Mitteilungen** – ein kurzer Hinweis der Redaktion an alle Besucher (einmal je Mitteilung)
- **Fürs Handy gebaut** – die meisten Besucher kommen übers Smartphone; geprüft bis 320 px Breite

## Redaktion

Unter `/admin` (Footer „Anmelden (Redaktion)“), Anmeldung **nur mit Passkey** – ohne Passwort
(ADR 023).

| Rolle                  | Darf                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Kirmesgesellschaft** | nur der eigene Ort: Termine (automatisch „bestätigt“), Plätze, Vorschläge, Korrekturen; eigene Leute einladen und entfernen, Vereinsname |
| **Redaktion**          | alle Termine, Orte, Plätze und Kartenlinks, Vorschläge und Korrekturen prüfen, Import, Mitteilungen                                      |
| **Admin**              | zusätzlich Mitglieder einladen, Rollen ändern, selbst angelegte Orte löschen, Sicherungen                                                |

- Erster Admin: `/admin/einrichten` → Link ans Redaktionspostfach → Name + Passkey
- Mitmachen: `/redaktion-mitmachen` → Anfrage erscheint unter „Anfragen“ (plus Mail an die
  Redaktion) → Admin nimmt an (Rolle Redaktion oder Kirmesgesellschaft mit Ort; der
  Einladungslink geht sofort per Mail an die Person) oder lehnt ab. Danach lädt die
  Kirmesgesellschaft weitere eigene Leute unter „Eure Leute“ selbst ein
- „Kirmes eintragen“: ganzes Programm auf einmal, fehlende Orte direkt mit anlegen, Kirmes vom
  Vorjahr übernehmen; Tabellen-Import unter „Mehr → Termine importieren“

Ältere **Bearbeitungslinks** (ohne Konto) funktionieren weiter und lassen sich unter „Mehr →
Bearbeitungslinks“ sperren; neue werden nicht mehr vergeben – Kirmesgesellschaften bekommen einen
eigenen Zugang mit Passkey.

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
Bei Google über die Search Console angemeldet (Sitemap `/sitemap.xml`, nur öffentliche Seiten).
Deploy, Secrets, Sicherungen, Wiederherstellung und Überwachung:
[docs/betrieb/hetzner-gitops.md](docs/betrieb/hetzner-gitops.md).

Ortsdaten © OpenStreetMap-Mitwirkende (ODbL), siehe [db/seed/ORTE-LIZENZ.md](db/seed/ORTE-LIZENZ.md).
