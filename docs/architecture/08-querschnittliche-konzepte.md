# 8. Querschnittliche Konzepte

## 8.1 Wartbarkeit

| Maßnahme                      | Umsetzung                                                                                                                                                           | Durchsetzung                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Dependency Inversion**      | Core definiert Ports (`TerminRepository`, `Uhr`); Adapter implementieren sie. Verdrahtung nur in `apps/api/src/main.ts` (Composition Root).                         | dependency-cruiser, ESLint                                     |
| **Framework-freie Fachlogik** | `packages/core` hat **null** Laufzeit-Abhängigkeiten → Regeln wie „Kirmes traditionell im Herbst“ (`istHerbstKirmes`) sind ohne Datenbank in Millisekunden testbar. | ESLint `no-restricted-imports`, Semgrep `kirmes-no-pg-in-core` |
| **Fehler als Werte**          | Domäne gibt `Result<T, Validierungsfehler[]>` zurück statt zu werfen; alle Fehler werden gesammelt.                                                                 | TypeScript `strict`                                            |
| **Statisches SQL ohne ORM**   | Jede Abfrage ist ein reviewbarer, konstanter String; optionale Filter über `cardinality($n)=0`.                                                                     | Semgrep-Regeln, ESLint-Selektor                                |
| **Eine Quelle der Wahrheit**  | Landkreise/Kategorien im Core; DB-Stammdaten und CHECK-Constraints daraus abgeleitet.                                                                               | Migrationsskript                                               |
| **Konsistenter Stil**         | Prettier + ESLint (`typescript-eslint strict`), Fachsprache Deutsch, Code-Bezeichner Deutsch.                                                                       | `npm run lint` in CI                                           |
| **Testpyramide**              | Unit (Core, Fakes statt Mocks), HTTP-Tests via `fastify.inject`, Integration gegen echtes PostGIS.                                                                  | Coverage ≥ 85 % + Ratchet                                      |
| **Docs-as-Code**              | arc42 im Repo; jede Architekturänderung im selben PR (DoD).                                                                                                         | PR-Template                                                    |

## 8.2 Domänenmodell und Validierung

- **KalenderDatum** (Branded Type `YYYY-MM-DD`): ungültige Tage wie `2026-02-29` werden abgewiesen.
- **Datumsbereich**: `von ≤ bis`, höchstens 366 Tage → schützt die DB vor teuren Volltabellen-Abfragen.
- **Landkreis**: nur die 23 Thüringer Kreise/kreisfreien Städte.
- **Saisonregel**: Kirmes außerhalb September–November ergibt einen **Hinweis**, keinen Fehler
  (Mai- und Osterkirmes sind legitim, aber selten).
- **Bestätigt-Flag**: Einträge der Kirmesgesellschaft sind `bestaetigt = true`; recherchierte Termine bleiben `false`, bis die Gesellschaft sie bestätigt. Die Quelle jedes Termins wird intern gespeichert (`termin.quelle`).

## 8.3 Fehlerbehandlung und Resilienz

| Situation                      | Verhalten                                                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fachlich ungültige Eingabe     | `400` + RFC 9457 Problem Details mit **allen** Fehlercodes (`fehler[]`)                                                                                                                                                                                                          |
| Unbekannte Query-Parameter     | `400` durch JSON-Schema (`additionalProperties: false`)                                                                                                                                                                                                                          |
| **Datenbank nicht erreichbar** | Adapter übersetzt Verbindungsfehler (`ECONNREFUSED`, SQLSTATE `08xxx`, `57P0x`, Timeout) in `PersistenzNichtVerfuegbar` → `503` + `Retry-After: 30`; `/health/ready` → `503`, damit der Orchestrator keinen Traffic schickt. Pool: Connect-Timeout 3 s, `statement_timeout` 5 s. |
| SQL-/Constraint-Fehler         | `500` „Interner Fehler“ **ohne** Details nach außen; vollständig im Log                                                                                                                                                                                                          |
| Fehler im Pool (Idle-Client)   | `pool.on('error')` → Log; Prozess bleibt stabil                                                                                                                                                                                                                                  |
| OpenStreetMap nicht erreichbar | `/karte` blendet die Karte nach Kachelfehlern aus, die Ortsliste steht immer darunter; Listen, Suche, Ortsseiten unabhängig                                                                                                                                                      |
| Frontend ohne JavaScript       | Ortsseiten und Landkreisseiten sind statisches HTML                                                                                                                                                                                                                              |
| Shutdown (SIGTERM)             | `app.close()` beendet laufende Requests, dann `pool.end()`                                                                                                                                                                                                                       |

## 8.4 Logging und Beobachtbarkeit

- **Strukturiertes JSON-Logging** (pino via Fastify), ein Eintrag pro Request mit `reqId`, Methode, Pfad, Status, Dauer.
- **Keine personenbezogenen Daten im Log**: `authorization` und `cookie` werden redigiert; Query-Strings enthalten keine personenbezogenen Daten.
- **Log-Level** über `LOG_LEVEL`; Fehler ≥ 500 immer mit Ursache (`err.cause`) für die Diagnose.
- **Health-Endpunkte**: `/health/live` (Prozess) und `/health/ready` (DB) für Docker/Kubernetes.
- Metriken (Request-Rate, Latenz p95, DB-Pool-Auslastung) sind als Ausbaustufe vorgesehen.

## 8.5 Sicherheitskonzept nach OWASP Top 10 (2021)

| OWASP                                  | Client-Tier                                                           | Server-Tier                                                                                                                                         | Data-Tier                                                                                | Automatische Prüfung                                                               |
| -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **A01 Broken Access Control**          | Redaktion nur unter `/admin` mit Sitzung; CSRF-Token + Origin-Prüfung | Akteur als Parameter, Rechte über Ports (Link-Berechtigung je Ort, Admin-Sitzung); Ort im `WHERE` jeder Schreibanweisung; Änderungsprotokoll        | API-Rolle `kirmes_app` ohne DDL (Migration 009), Migrationen als Owner; Integrationstest | Review, DAST                                                                       |
| **A02 Cryptographic Failures**         | HTTPS, HSTS am Proxy                                                  | Keine Secrets im Code, Konfiguration via ENV                                                                                                        | TLS zur DB (`DB_SSL=true`, `rejectUnauthorized`)                                         | TruffleHog                                                                         |
| **A03 Injection**                      | Ausgabe-Escaping (Astro), `esc()` im Such-Rendering                   | JSON-Schema + Core-Validierung; nur parametrisierte Statements; LIKE-Metazeichen escaped                                                            | CHECK-Constraints                                                                        | Semgrep (eigene pg-Regeln + `p/sql-injection`), Integrationstest mit `' OR 1=1 --` |
| **A04 Insecure Design**                | Rate-Limit je Client-IP (120 Seiten/min, 429 + Retry-After)           | Datumsbereich ≤ 366 Tage, Limit ≤ 200, Rate-Limit                                                                                                   | Statement-Timeout                                                                        | Unit-Tests                                                                         |
| **A05 Security Misconfiguration**      | CSP ohne `unsafe-inline`, COOP/COEP/CORP, `nosniff`                   | Helmet, keine Stacktraces, API nur intern                                                                                                           | DB-Port nicht öffentlich                                                                 | ZAP Baseline, Semgrep (nginx)                                                      |
| **A06 Vulnerable Components**          | Astro/Vite aktuell                                                    | Fastify/pg aktuell                                                                                                                                  | Image-Tag gepinnt                                                                        | npm audit, OSV-Scanner, Dependabot                                                 |
| **A07 Identification & Auth Failures** | Sitzungs-Cookie HttpOnly/Secure/SameSite=Strict, 12 h                 | Nur Passkey (WebAuthn, UV Pflicht, an Domain gebunden); Rollen admin/redaktion serverseitig; Einladungen einmalig (Hash); Sperre nach Fehlversuchen | –                                                                                        | Issue P0                                                                           |
| **A08 Software & Data Integrity**      | –                                                                     | Actions auf SHA gepinnt, `npm ci` mit Lockfile                                                                                                      | Migrationen versioniert                                                                  | Dependabot, Harden-Runner                                                          |
| **A09 Logging & Monitoring Failures**  | –                                                                     | Strukturierte Logs, Fehler mit Ursache                                                                                                              | Postgres-Logs                                                                            | –                                                                                  |
| **A10 SSRF**                           | –                                                                     | Kein serverseitiges Abrufen von Nutzer-URLs; Geocoding nur mit fester Nominatim-URL                                                                 | –                                                                                        | Semgrep                                                                            |

### Security-Pipeline (`.github/workflows/security-and-quality.yml`)

| Gate             | Werkzeug                                                                                                                              | Bricht ab bei                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Secret Scanning  | TruffleHog (gesamte History)                                                                                                          | verifizierten **und** unverifizierten Treffern            |
| SAST             | Semgrep: `security-audit`, `sql-injection`, `owasp-top-ten`, `typescript`, `nodejs` + eigene Regeln                                   | Befunden `WARNING` (≈ Medium) und `ERROR` (≈ High)        |
| SCA              | `npm audit` + OSV-Scanner (osv.dev: GitHub-Advisories, npm, NVD; ersetzt OWASP Dependency-Check, dessen NVD-Abgleich Stunden dauerte) | Laufzeit ≥ moderate, Dev ≥ high, OSV: jeder bekannte Fund |
| DAST             | OWASP ZAP Baseline gegen Web **und** API                                                                                              | Alerts mit Risiko Medium/High (`scripts/zap-gate.mjs`)    |
| Qualität         | ESLint, Prettier, dependency-cruiser, tsc                                                                                             | jedem Verstoß                                             |
| Tests & Coverage | Vitest + PostGIS-Service                                                                                                              | Abdeckung < 85 % **oder** sinkend ggü. Basis-Branch       |

### Bearbeitungslinks (Festplätze)

| Maßnahme                   | Umsetzung                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unratbare Tokens           | 32 Byte aus `crypto.randomBytes` (256 Bit), Base64url                                                                                                        |
| Kein Klartext in der DB    | Gespeichert wird nur der SHA-256-Hash; ein DB-Leck verrät keine gültigen Links                                                                               |
| Kein Token in Logs/Referer | Token steht im URL-Fragment (`#k=…`), wird per JS in `sessionStorage` übernommen und aus der Adresszeile entfernt; Übertragung nur im `Authorization`-Header |
| Geringste Rechte           | Ein Link berechtigt ausschließlich für **einen** Ort und nur für Festplätze                                                                                  |
| Nachvollziehbarkeit        | Jede Änderung mit Link-ID, Zeit und Werten in `aenderungsprotokoll`                                                                                          |
| Widerruf                   | `npm run link -- sperren <id>` – sofort wirksam                                                                                                              |
| Fachliche Plausibilität    | Koordinaten nur innerhalb Thüringens (vertauschte Breite/Länge werden erkannt)                                                                               |
| Datenschutz                | Kartenkacheln (OpenStreetMap) nur auf `/karte` und der Bearbeitungsseite, Adresssuche und Standort nur dort; je eigene CSP                                   |

### Redaktionszugang (Admin)

| Maßnahme                  | Umsetzung                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nur Passkey               | Kein Passwort, kein TOTP, keine E-Mail (ADR 023). Gespeichert: Anzeigename (ohne Steuer-/Formatzeichen), Rolle, zufällige Kennung, öffentlicher Schlüssel, Zeitstempel                                                                                                                                                                                                              |
| Rollen                    | `admin` verwaltet Mitglieder und Einladungen, `redaktion` pflegt Inhalte; geprüft im Use Case bei jeder Anfrage (Rolle wird je Anfrage aus der DB gelesen). Mindestens ein Admin bleibt; der letzte Passkey bleibt                                                                                                                                                                  |
| Einladungen               | 256-Bit-Token, nur SHA-256 gespeichert, 7 Tage, einmalig (Zeilensperre in der Anlage-Transaktion), widerrufbar; Token wird nie geloggt. Aufnahmen, Rollenänderungen, Entfernen werden mit handelnder Mitglieds-ID protokolliert                                                                                                                                                     |
| Updates ohne Datenverlust | Migrations-Sperre (nur additiv, Freigabe-Kommentar für Ausnahmen), Upgrade-Test in der CI (Basis → PR mit Testdaten, jede Zeile verglichen), Sicherung vor jedem Update auf dem Server (Issue #59)                                                                                                                                                                                  |
| Brute-Force-Schutz        | Sperre nach 5 Fehlversuchen je E-Mail bzw. 30 insgesamt für 15 Minuten (HTTP 429)                                                                                                                                                                                                                                                                                                   |
| Sitzungen                 | 256-Bit-Token, in der DB nur als SHA-256; Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/admin`, 12 h                                                                                                                                                                                                                                                                       |
| Reihenfolge               | Anmeldeprüfung (`onRequest`) **vor** der Eingabevalidierung – Nicht-Angemeldete erfahren nichts über Schemas                                                                                                                                                                                                                                                                        |
| CSRF                      | Synchronizer-Token (`csrf_token` im Formular bzw. Header `X-CSRF-Token` bei JSON, HttpOnly-Cookie, Vergleich in konstanter Zeit) **und** eigene Origin-Prüfung gegen Host/X-Forwarded-Host; dazu `SameSite=Strict`. Astros `checkOrigin` ist abgeschaltet, weil es hinter dem Proxy die echte Adresse nicht kennt                                                                   |
| Passkeys (WebAuthn)       | Einziger Anmeldeweg: Benutzerverifikation (Biometrie/PIN) Pflicht; RP-ID = Hostname aus `WEBSITE_URL`, Origin geprüft (phishing-resistent); Challenge zufällig, einmalig; getrennte Speicher für Anmeldung und Registrierung; Signaturzähler gegen geklonte Geräte; nur öffentlicher Schlüssel in `admin_passkey`. Sitzungs-Token bleibt im HttpOnly-Cookie, die Seite sieht es nie |
| Nachvollziehbarkeit       | Admin-Änderungen im `aenderungsprotokoll` (Spalte `admin_id`)                                                                                                                                                                                                                                                                                                                       |
| Kein Index                | `/admin` mit `noindex`, `X-Robots-Tag` und `Cache-Control: no-store`                                                                                                                                                                                                                                                                                                                |

### Mitteilungen

Nur Klartext (Darstellung per `textContent`, nie als HTML), Links nur `https://` oder seitenintern.
Ob eine Mitteilung gelesen wurde, speichert nur der Browser des Besuchers (`localStorage`, keine Cookies).

Welche Mitteilung die neueste ist, entscheidet der Zeitstempel `veroeffentlicht_am` (bei
Gleichstand die höhere `id`) – nie die für die Anzeige formatierte Spalte gleichen Namens, die
nur minutengenau ist (Issue #25). Im SQL daher immer `ORDER BY mitteilung.veroeffentlicht_am`.

### Strukturierte Daten (JSON-LD)

Terminseiten betten schema.org-`Event` als `<script type="application/ld+json">` ein. Weil Titel,
Band und Hinweise von außen kommen, wird jedes `<` im JSON als `\u003c` geschrieben – ein Titel
mit `</script>` kann den Block nicht verlassen (Issue #22, Kap. 8.5 A03).

### Gestaltung

- Schriften (Bitter, Source Sans 3) und Icons liegen auf dem eigenen Server (`@fontsource`,
  SVG-Icon-Komponente) – keine Anfragen an Google Fonts oder CDNs, passend zur CSP und zum
  Datenschutz (Issue #21).
- Vorschaubilder (`og.png`, App-Icons) erzeugt `scripts/bilder-erzeugen.mjs` aus dem SVG-Logo.
- Farben als CSS-Variablen in `styles/global.css`, helles und dunkles Farbschema; Tippflächen auf
  Touch-Geräten ≥ 44 px (Issue #30), Druckansicht für die Muttizettel-Vorlage (Issue #32).

## Rechte

Wer was darf, steht an einer Stelle im Core (`rechte.ts`) – Tabelle und Regeln: [rechte.md](rechte.md).
