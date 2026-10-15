# 10. Qualitätsanforderungen

## 10.1 Qualitätsbaum

- **Wartbarkeit** → Modularität (Schichtregeln), Testbarkeit (Core ohne DB testbar), Analysierbarkeit (statisches SQL)
- **Sicherheit** → Integrität (keine Injection), Vertraulichkeit (keine Secrets, keine Interna in Fehlern), Verfügbarkeit (Rate-Limit, 503 statt Absturz)
- **Korrektheit** → Validierung, Bestätigt-Status
- **Effizienz** → Antwortzeit der Suche

## 10.2 Qualitätsszenarien

| ID  | Szenario                                                        | Messgröße / Akzeptanz                                                                                    |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| W1  | Neue Fachregel (z. B. „Kirmes nie an Heiligabend“) wird ergänzt | Änderung nur in `packages/core`; Unit-Test läuft ohne DB in < 1 s                                        |
| W2  | PostgreSQL-Treiber wird ausgetauscht                            | Nur `apps/api/src/infrastructure/postgres` ändert sich; Core-Tests unverändert grün                      |
| W3  | Jemand importiert `pg` im Core                                  | CI bricht im Lint-Job ab                                                                                 |
| S1  | Angreifer sendet `q=' OR 1=1 --`                                | Wird als Literal gesucht, 0 Treffer (Integrationstest)                                                   |
| S2  | Abhängigkeit mit bekannter Schwachstelle                        | Pipeline schlägt fehl (npm audit, OSV-Scanner), PR nicht mergebar                                        |
| S3  | Datenbank fällt aus                                             | API antwortet in < 4 s mit 503 + Retry-After; kein Stacktrace                                            |
| E1  | Suche über ein Jahr, ein Landkreis                              | p95 < 200 ms bei 10.000 Terminen – **gemessen: p95 114 ms** (4 parallel), 39 ms (einzeln), Tabelle unten |
| K1  | Ungültiges Datum `2026-02-29`                                   | Wird mit `DATUM_UNGUELTIG` abgewiesen                                                                    |

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
