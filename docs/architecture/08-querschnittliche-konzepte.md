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
- **Bestätigt-Flag**: aus Vorjahren hochgerechnete Termine bleiben `bestaetigt = false` und werden im UI markiert.

## 8.3 Fehlerbehandlung und Resilienz

| Situation                      | Verhalten                                                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fachlich ungültige Eingabe     | `400` + RFC 9457 Problem Details mit **allen** Fehlercodes (`fehler[]`)                                                                                                                                                                                                          |
| Unbekannte Query-Parameter     | `400` durch JSON-Schema (`additionalProperties: false`)                                                                                                                                                                                                                          |
| **Datenbank nicht erreichbar** | Adapter übersetzt Verbindungsfehler (`ECONNREFUSED`, SQLSTATE `08xxx`, `57P0x`, Timeout) in `PersistenzNichtVerfuegbar` → `503` + `Retry-After: 30`; `/health/ready` → `503`, damit der Orchestrator keinen Traffic schickt. Pool: Connect-Timeout 3 s, `statement_timeout` 5 s. |
| SQL-/Constraint-Fehler         | `500` „Interner Fehler“ **ohne** Details nach außen; vollständig im Log                                                                                                                                                                                                          |
| Fehler im Pool (Idle-Client)   | `pool.on('error')` → Log; Prozess bleibt stabil                                                                                                                                                                                                                                  |
| OpenStreetMap nicht erreichbar | Karte zeigt Hinweis; Listen, Suche, Ortsseiten funktionieren weiter                                                                                                                                                                                                              |
| Frontend ohne JavaScript       | Ortsseiten und Landkreisseiten sind statisches HTML                                                                                                                                                                                                                              |
| Shutdown (SIGTERM)             | `app.close()` beendet laufende Requests, dann `pool.end()`                                                                                                                                                                                                                       |

## 8.4 Logging und Beobachtbarkeit

- **Strukturiertes JSON-Logging** (pino via Fastify), ein Eintrag pro Request mit `reqId`, Methode, Pfad, Status, Dauer.
- **Keine personenbezogenen Daten im Log**: `authorization` und `cookie` werden redigiert; Query-Strings enthalten keine personenbezogenen Daten.
- **Log-Level** über `LOG_LEVEL`; Fehler ≥ 500 immer mit Ursache (`err.cause`) für die Diagnose.
- **Health-Endpunkte**: `/health/live` (Prozess) und `/health/ready` (DB) für Docker/Kubernetes.
- Metriken (Request-Rate, Latenz p95, DB-Pool-Auslastung) sind als Ausbaustufe vorgesehen.

## 8.5 Sicherheitskonzept nach OWASP Top 10 (2021)

| OWASP                                  | Client-Tier                                         | Server-Tier                                                                              | Data-Tier                                                | Automatische Prüfung                                                               |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **A01 Broken Access Control**          | Keine Verwaltungsfunktionen im Client               | Schreib-Endpunkte erst mit AuthN/AuthZ (Issue P0)                                        | App-User ohne DDL-Rechte; Migrationen mit separatem User | Review, DAST                                                                       |
| **A02 Cryptographic Failures**         | HTTPS, HSTS am Proxy                                | Keine Secrets im Code, Konfiguration via ENV                                             | TLS zur DB (`DB_SSL=true`, `rejectUnauthorized`)         | TruffleHog                                                                         |
| **A03 Injection**                      | Ausgabe-Escaping (Astro), `esc()` im Such-Rendering | JSON-Schema + Core-Validierung; nur parametrisierte Statements; LIKE-Metazeichen escaped | CHECK-Constraints                                        | Semgrep (eigene pg-Regeln + `p/sql-injection`), Integrationstest mit `' OR 1=1 --` |
| **A04 Insecure Design**                | –                                                   | Datumsbereich ≤ 366 Tage, Limit ≤ 200, Rate-Limit                                        | Statement-Timeout                                        | Unit-Tests                                                                         |
| **A05 Security Misconfiguration**      | CSP ohne `unsafe-inline`, COOP/COEP/CORP, `nosniff` | Helmet, keine Stacktraces, API nur intern                                                | DB-Port nicht öffentlich                                 | ZAP Baseline, Semgrep (nginx)                                                      |
| **A06 Vulnerable Components**          | Astro/Vite aktuell                                  | Fastify/pg aktuell                                                                       | Image-Tag gepinnt                                        | npm audit, OWASP Dependency-Check, Dependabot                                      |
| **A07 Identification & Auth Failures** | –                                                   | Geplant: OIDC/Passkey für Redaktion, Session-Härtung                                     | –                                                        | Issue P0                                                                           |
| **A08 Software & Data Integrity**      | –                                                   | Actions auf SHA gepinnt, `npm ci` mit Lockfile                                           | Migrationen versioniert                                  | Dependabot, Harden-Runner                                                          |
| **A09 Logging & Monitoring Failures**  | –                                                   | Strukturierte Logs, Fehler mit Ursache                                                   | Postgres-Logs                                            | –                                                                                  |
| **A10 SSRF**                           | –                                                   | Kein serverseitiges Abrufen von Nutzer-URLs; Geocoding nur mit fester Nominatim-URL      | –                                                        | Semgrep                                                                            |

### Security-Pipeline (`.github/workflows/security-and-quality.yml`)

| Gate             | Werkzeug                                                                                            | Bricht ab bei                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Secret Scanning  | TruffleHog (gesamte History)                                                                        | verifizierten **und** unverifizierten Treffern         |
| SAST             | Semgrep: `security-audit`, `sql-injection`, `owasp-top-ten`, `typescript`, `nodejs` + eigene Regeln | Befunden `WARNING` (≈ Medium) und `ERROR` (≈ High)     |
| SCA              | `npm audit` + OWASP Dependency-Check                                                                | Laufzeit ≥ moderate, Dev ≥ high, CVSS ≥ 4.0            |
| DAST             | OWASP ZAP Baseline gegen Web **und** API                                                            | Alerts mit Risiko Medium/High (`scripts/zap-gate.mjs`) |
| Qualität         | ESLint, Prettier, dependency-cruiser, tsc                                                           | jedem Verstoß                                          |
| Tests & Coverage | Vitest + PostGIS-Service                                                                            | Abdeckung < 85 % **oder** sinkend ggü. Basis-Branch    |

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
| Datenschutz                | Kartenkacheln/Adresssuche (OpenStreetMap) und Standort nur auf der Bearbeitungsseite; eigene CSP dafür                                                       |
