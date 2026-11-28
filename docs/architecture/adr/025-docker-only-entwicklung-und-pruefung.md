# ADR 025: Docker-only für Entwicklung und Prüfung

- Status: angenommen
- Datum: 2026-11-24
- Issue: #445

## Kontext

Betrieb und Datenbank liefen schon in Docker, die Entwicklung aber verlangte Node.js ≥ 26 auf dem Rechner (`npm install`, `npm run dev`, Lint, Tests, Hilfsskripte). Das erzeugt Abweichungen zwischen Rechner, CI und Server und macht neue Mitwirkende abhängig von lokalen Installationen.

## Entscheidung

Nichts läuft direkt auf dem Rechner. Die Compose-Datei enthält zusätzlich zu den Betriebsdiensten drei Profile:

| Profil  | Services                    | Zweck                                                                  |
| ------- | --------------------------- | ---------------------------------------------------------------------- |
| `tools` | `tools`                     | Beliebiger Befehl im Projektordner (`docker compose run --rm tools …`) |
| `dev`   | `dev`, `tools`              | API (3100) und Website (4321) mit Neuladen, Migrationen vorab          |
| `check` | `check`, `db-test`, `tools` | Das Quality Gate der CI im Container, gegen eine Wegwerf-Datenbank     |

Das Werkzeug-Image (`docker/werkzeug.Dockerfile`) basiert auf `node:26-alpine` plus `git` (Upgrade-Test) und `psql`. Abhängigkeiten werden beim Start installiert, wenn sich `package-lock.json` ändert, und liegen in benannten Volumes (nicht im Projektordner, kein Konflikt mit Host-Binärdateien).

## Begründung

- Gleiche Node-Version und gleiche Pakete in Entwicklung, CI und Betrieb.
- Die Prüfung läuft nie gegen die Arbeitsdatenbank (`db-test` im Arbeitsspeicher).
- Der Produktionsbetrieb ändert sich nicht: Die neuen Services haben Profile und starten nie mit `up` im Server-Stack. Volumes, Zugänge und Daten bleiben unberührt.

## Folgen

- Der erste Lauf installiert alle Pakete (einige Minuten), spätere Läufe sind schnell.
- Die PostGIS-Images laufen auf Apple Silicon emuliert (amd64), das war schon vorher so.
- `npm run …` direkt auf dem Rechner ist nicht mehr der dokumentierte Weg. Die Skripte in `package.json` bleiben unverändert und laufen im Container.
- `scripts/test-db.sh` (Hilfsskript für eine lokale Test-Datenbank im Arbeits-Container) wird durch `db-test` ersetzt.
