# 10. Qualitätsanforderungen

## 10.1 Qualitätsbaum

- **Wartbarkeit** → Modularität (Schichtregeln), Testbarkeit (Core ohne DB testbar), Analysierbarkeit (statisches SQL)
- **Sicherheit** → Integrität (keine Injection), Vertraulichkeit (keine Secrets, keine Interna in Fehlern), Verfügbarkeit (Rate-Limit, 503 statt Absturz)
- **Korrektheit** → Validierung, Bestätigt-Status
- **Effizienz** → Antwortzeit der Suche

## 10.2 Qualitätsszenarien

| ID  | Szenario                                                        | Messgröße / Akzeptanz                                                               |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| W1  | Neue Fachregel (z. B. „Kirmes nie an Heiligabend“) wird ergänzt | Änderung nur in `packages/core`; Unit-Test läuft ohne DB in < 1 s                   |
| W2  | PostgreSQL-Treiber wird ausgetauscht                            | Nur `apps/api/src/infrastructure/postgres` ändert sich; Core-Tests unverändert grün |
| W3  | Jemand importiert `pg` im Core                                  | CI bricht im Lint-Job ab                                                            |
| S1  | Angreifer sendet `q=' OR 1=1 --`                                | Wird als Literal gesucht, 0 Treffer (Integrationstest)                              |
| S2  | Abhängigkeit mit CVE (CVSS ≥ 4)                                 | Pipeline schlägt fehl, PR nicht mergebar                                            |
| S3  | Datenbank fällt aus                                             | API antwortet in < 4 s mit 503 + Retry-After; kein Stacktrace                       |
| E1  | Suche über ein Jahr, ein Landkreis                              | p95 < 200 ms bei 10.000 Terminen (Messung offen, siehe Kap. 11)                     |
| K1  | Ungültiges Datum `2026-02-29`                                   | Wird mit `DATUM_UNGUELTIG` abgewiesen                                               |
