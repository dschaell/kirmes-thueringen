# 10. Qualitätsanforderungen

## 10.1 Qualitätsbaum

- **Wartbarkeit** → Modularität (Schichtregeln), Testbarkeit (Core ohne DB testbar), Analysierbarkeit (statisches SQL)
- **Sicherheit** → Integrität (keine Injection), Vertraulichkeit (keine Secrets, keine Interna in Fehlern), Verfügbarkeit (Rate-Limit, 503 statt Absturz)
- **Korrektheit** → Validierung, Bestätigt-Status
- **Effizienz** → Antwortzeit der Suche
- **Datenhaltbarkeit** → ergänzende Migrationen, Upgrade-Test, Sicherung und Wiederherstellung
- **Reproduzierbarkeit** → alles in Docker, gleiche Versionen in Entwicklung, CI und Betrieb

## 10.2 Qualitätsszenarien

| ID  | Szenario                                                        | Messgröße / Akzeptanz                                                                                            |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| W1  | Neue Fachregel (z. B. „Kirmes nie an Heiligabend“) wird ergänzt | Änderung nur in `packages/core`; Unit-Test läuft ohne DB in < 1 s                                                |
| W2  | PostgreSQL-Treiber wird ausgetauscht                            | Nur `apps/api/src/infrastructure/postgres` ändert sich; Core-Tests unverändert grün                              |
| W3  | Jemand importiert `pg` im Core                                  | CI bricht im Lint-Job ab                                                                                         |
| S1  | Angreifer sendet `q=' OR 1=1 --`                                | Wird als Literal gesucht, 0 Treffer (Integrationstest)                                                           |
| S2  | Abhängigkeit mit bekannter Schwachstelle                        | Pipeline schlägt fehl (npm audit, OSV-Scanner), PR nicht mergebar                                                |
| S3  | Datenbank fällt aus                                             | API antwortet in < 4 s mit 503 + Retry-After; kein Stacktrace                                                    |
| E1  | Suche über ein Jahr, ein Landkreis                              | p95 < 200 ms bei 10.000 Terminen – **gemessen: p95 114 ms** (4 parallel), 39 ms (einzeln), Tabelle unten         |
| K1  | Ungültiges Datum `2026-02-29`                                   | Wird mit `DATUM_UNGUELTIG` abgewiesen                                                                            |
| D1  | Neue Migration löscht oder ändert Nutzerdaten                   | Lint bricht ab (Migrationssperre), Ausnahme nur mit Freigabe-Kommentar `-- datenaenderung-freigegeben: #<issue>` |
| D2  | Update auf einen Bestand mit Konten, Passkeys, Sitzungen        | Upgrade-Test vergleicht jede Zeile und Spalte vorher/nachher, keine Abweichung (`scripts/upgrade-test.mjs`)      |
| D3  | Update scheitert mitten im Lauf                                 | Vor jedem Update liegt ein Dump (`vor-update-*.dump`); scheitert er, startet das Update nicht                    |
| D4  | Datenbank muss wiederhergestellt werden                         | Dump in neue Datenbank zurückspielen, Zeilenzahlen aller Tabellen gleich (`scripts/db-restore-test.sh`)          |
| Z1  | Wer darf was                                                    | Einzige Quelle `rechte.ts`; Kirmesgesellschaft nur eigener Ort, nur freigegebene Routen (`KG_ROUTEN`)            |
| B1  | Die letzte Sicherung ist zu alt oder fehlgeschlagen             | Redaktion sieht Warnung (rot ab 36 Stunden), `status.json` nennt den Grund                                       |
| R1  | Neue Mitwirkende wollen lokal arbeiten                          | Nur Docker nötig: `docker compose run --rm check` bildet das Quality Gate nach (ADR 025)                         |

### Messung E1 (Baseline)

`npm run lastdaten -w @kirmes/api -- 10000 900` erzeugt in einer eigenen Datenbank (`kirmes_perf`)
900 Orte in allen 23 Landkreisen und 10.000 Termine eines Jahres – jeder über `validiereTermin`,
fester Seed. `node scripts/lasttest.mjs <api> 400 <parallel>` misst je 400 Anfragen gegen den
kompilierten API-Build (Laptop, PostgreSQL in Docker), 10 Aufwärmanfragen zählen nicht:

| Szenario (limit)                         | einzeln p50 / p95 | 4 parallel p50 / p95 | 8 parallel p50 / p95 |
| ---------------------------------------- | ----------------- | -------------------- | -------------------- |
| **E1** Jahr + Landkreis (200 Treffer)    | 32 / 39 ms        | 67 / **114 ms**      | 143 / 219 ms         |
| Jahr + Freitext (50)                     | 29 / 36 ms        | 61 / 96 ms           | 132 / 257 ms         |
| Jahr ohne Filter (50, zählt alle 10.000) | 50 / 58 ms        | 107 / 180 ms         | 216 / 322 ms         |

Bei 8 parallelen Clients ohne Pause (≈ 48 Anfragen/s, > 170.000 pro Stunde) ist ein einzelner
API-Prozess ausgelastet; das liegt weit über der erwarteten Last. Zwei Änderungen haben die Werte
ermöglicht: Trigramm-Indizes für die Freitextsuche (Migration 008) und das Laden von Details und
Festplatz erst **nach** dem Kürzen auf eine Seite – vorher dauerte „Jahr ohne Filter“ ~1 s (p50).

## 10.3 Qualitätsgates

| Gate                | Wo                                            | Inhalt                                                                                            |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Lint                | CI-Job „Lint, Format, Typen, Schichtenregeln“ | ESLint, Prettier, Migrationssperre, dependency-cruiser (Clean-Architecture-Grenzen), Typen, Build |
| Tests und Abdeckung | CI-Job „Tests & Coverage-Gate“                | Unit-, HTTP- und Integrationstests gegen PostGIS, Mindestabdeckung (vitest thresholds)            |
| Coverage-Ratchet    | PR                                            | Abdeckung darf gegenüber dem Basis-Branch nicht sinken (`scripts/coverage-ratchet.mjs`)           |
| Upgrade-Test        | PR                                            | Ein Update ändert keine Nutzerdaten (`scripts/upgrade-test.mjs`)                                  |
| Geheimnisse         | CI                                            | TruffleHog                                                                                        |
| SAST                | CI                                            | Semgrep mit eigenen Regeln (ADR 007, 008)                                                         |
| SCA                 | CI                                            | `npm audit`, OSV-Scanner (ADR 020)                                                                |
| DAST                | CI                                            | OWASP ZAP gegen die laufende Anwendung                                                            |
| Quality Gate        | CI-Job `gate`                                 | Sammelgate; nur bei grün ist der Merge in `main` möglich                                          |
| Täglich             | `website-pruefung.yml`, `erreichbarkeit.yml`  | Inhalte, Lighthouse, SEO; Erreichbarkeit als Rückfallebene                                        |
| Lokal               | `docker compose run --rm check`               | Lint, Typen, Build, Migrationen, Tests mit Abdeckung im Container gegen `kirmes_test`             |
