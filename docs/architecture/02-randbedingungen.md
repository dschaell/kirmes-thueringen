# 2. Randbedingungen

## Technisch

| Randbedingung                   | Erläuterung                                                            |
| ------------------------------- | ---------------------------------------------------------------------- |
| PostgreSQL ≥ 17 mit PostGIS     | Vorgegebene Persistenz; Geodaten der Orte als `geography(Point, 4326)` |
| N-Tier (Client / Server / Data) | Strikte Trennung, Kommunikation nur über definierte Schnittstellen     |
| TypeScript durchgängig          | Eine Sprache in allen Schichten senkt den Wartungsaufwand              |
| Node.js 24 LTS                  | Laufzeit für API und Build                                             |
| Container (OCI)                 | Betrieb als Docker-Images, lokal via `docker compose`                  |
| Nur Open-Source-Komponenten     | Keine Lizenzkosten für ein ehrenamtliches Projekt                      |

## Organisatorisch

| Randbedingung                    | Erläuterung                                                             |
| -------------------------------- | ----------------------------------------------------------------------- |
| GitHub (öffentliches Repository) | Code, Issues, CI/CD; keine Secrets im Repo                              |
| Trunk-based mit Pull Requests    | `main` geschützt, Merge nur bei grünem Quality Gate                     |
| Termindaten nicht im Repository  | Bis zur Zustimmung des Altbetreibers nur lokal (`db/seed/termine.json`) |

## Rechtlich

- **DSGVO**: Kontaktdaten von Veranstaltern sind personenbezogen → Datensparsamkeit, kein Tracking.
- **Impressumspflicht** (§ 5 DDG) für den öffentlichen Betrieb.
- **OpenStreetMap / ODbL**: Namensnennung „© OpenStreetMap-Mitwirkende“ bei Karten und Geodaten;
  Nominatim-Nutzungsrichtlinie (max. 1 Anfrage/s, eigener User-Agent).
