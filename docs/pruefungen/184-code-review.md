# Code-Review (Issue #184) – 19.10.2026

Gesamter Code (Core, API, Web, Betrieb) nach Sicherheit, Korrektheit, Wartbarkeit und Betrieb.
Stand: main nach #189, dazu die offenen PRs #190–#195.

## Positiv

- **Schichten** sauber: Fachlogik im Core ohne Framework/DB; dependency-cruiser prüft das.
- **Typen** streng: keine `as never`/`as unknown` und kein `eslint-disable` im Produktivcode, keine
  TODO/FIXME.
- **SQL** durchgehend parametrisiert; eigene Semgrep-Regeln gegen SQL-Injection.
- **Netzwerk**: jeder serverseitige `fetch` hat einen Timeout; Kurzlinks werden nur zu Google
  aufgelöst (keine internen Adressen).
- **Web**: strenge CSP ohne `unsafe-inline`, CSRF in allen Formularen bzw. Bearer-Token bei
  `/verwalten`.
- **Daten**: Migrationen nur ergänzend (Sperre im Lint), Upgrade-Test in der CI, Datenänderungen nur
  mit Freigabe-Kommentar.
- **Tests**: ~590 Tests, Branch-Coverage ~97,6 % mit Ratchet; DAST, SAST, SCA im Quality Gate.

## Befunde

| #   | Bereich        | Befund                                                                                                                                      | Folge                     |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Performance    | „Zuletzt bearbeitet von“ (#181) las das Protokoll ohne Index                                                                                | **behoben** in #194 (024) |
| 2   | Tests          | Integrationstests laufen parallel gegen dieselbe Test-DB; ein sporadischer Fehlschlag beobachtet                                            | #196                      |
| 3   | Web            | 6 Client-Skripte ohne import/export sind globale Skripte – gleiche Namen kollidieren (in #161 passiert)                                     | #197                      |
| 4   | Sicherheit     | Rollenprüfungen an vielen Stellen als String-Vergleich; mit der Rolle Kirmesgesellschaft (#180) kommen Freigabelisten dazu → zentralisieren | #198                      |
| 5   | Wartbarkeit    | Große Dateien (admin-routen.ts, admin/termine.astro, KirmesAssistent, app.ts, assistent.ts)                                                 | #199                      |
| 6   | Funktion       | Kirmesgesellschaften sehen „angelegt/bearbeitet von“ nicht (Route aus Vorsicht gesperrt)                                                    | #200                      |
| 7   | Abhängigkeiten | Major-Sprünge (TypeScript 7, dependency-cruiser 18, prettier-plugin-astro 1) hebt Dependabot nicht automatisch                              | #201                      |
| 8   | Betrieb        | Ausfall-Alarm über GitHub-Zeitplan unzuverlässig → externer Monitor                                                                         | #173 (offen, Betreiber)   |
| 9   | CI             | ZAP fand `/verwalten` über robots.txt; CSRF-Meldung dort ein Fehlalarm (Bearer-Token) → gezielte, begründete Ausnahme nur für diese Adresse | **behoben** in #190       |

## Empfehlung zur Reihenfolge

1. #198 (Rechte zentral) – vor weiteren Rollen-Funktionen
2. #196 (stabile Tests) und #197 (Skripte als Module) – klein, verhindern Folgefehler
3. #200, #199, #201 nach Bedarf
