## Was und warum

Closes #

## Checkliste (Definition of Done)

- [ ] Tests ergänzt/angepasst, Coverage nicht gesunken
- [ ] Schichtenregeln eingehalten (Core ohne Framework-/DB-Abhängigkeiten)
- [ ] SQL nur parametrisiert (`$1 …`), keine String-Verkettung
- [ ] Keine Secrets, keine personenbezogenen Daten in Logs
- [ ] **arc42 aktualisiert** (`docs/architecture/`): betroffene Kapitel, bei neuer
      Architekturentscheidung eine ADR-Datei unter `docs/architecture/adr/`
- [ ] Betrieb betroffen? → `docs/betrieb/betriebshandbuch.md` angepasst
- [ ] Im Browser geprüft (Desktop und Handy), falls sichtbar
