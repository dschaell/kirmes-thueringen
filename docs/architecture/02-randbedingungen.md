# 2. Randbedingungen

## 2.1 Technisch

| Randbedingung                   | Erläuterung                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 17 mit PostGIS 3.5   | Vorgegebene Persistenz; Orte als `geography(Point, 4326)`. Das PostGIS-Image gibt es nur für amd64 (auf Apple Silicon emuliert, `DB_PLATFORM`) |
| N-Tier (Client / Server / Data) | Strikte Trennung, Kommunikation nur über definierte Schnittstellen: Website → API → Datenbank                                                  |
| TypeScript durchgängig          | Eine Sprache in allen Schichten (ADR 001), TypeScript ~6.0                                                                                     |
| Node.js 26                      | Laufzeit in allen Images (`node:26-alpine`), in der CI (`NODE_VERSION: '26'`) und im Werkzeug-Container                                        |
| Fastify 5, Astro (SSR), `pg`    | Kein ORM, statisches SQL (ADR 003); Website rendert serverseitig und spricht nur mit der API                                                   |
| Container (OCI)                 | Betrieb als Docker-Images (`web`, `api`, `backup`), Datenbank als PostGIS-Image                                                                |
| Nur Open-Source-Komponenten     | Keine Lizenzkosten                                                                                                                             |

## 2.2 Betriebsvorgabe: ausschließlich Docker

Nichts läuft direkt auf dem Rechner. Das gilt für den Server (Docker Compose per GitOps) ebenso wie für Entwicklung, Tests und Hilfsskripte.

| Tätigkeit                        | Befehl                                              | Service                                 |
| -------------------------------- | --------------------------------------------------- | --------------------------------------- |
| Entwicklung (Neuladen)           | `docker compose --profile dev up`                   | `dev`, `db`                             |
| Quality Gate lokal               | `docker compose run --rm check`                     | `check`, `db-test`                      |
| Beliebiger Befehl (CLI, Skripte) | `docker compose run --rm tools npm run db:orte`     | `tools`, `db`                           |
| Lokal komplett wie Produktion    | `docker compose --profile app up -d --build`        | `db`, `migrate`, `api`, `web`           |
| Mails abfangen                   | `docker compose --profile mail up -d mailpit`       | `mailpit`                               |
| Server                           | GitOps (Stack in `intershopper/server-deployments`) | `db`, `migrate`, `api`, `web`, `backup` |

Die Werkzeug-Container legen Abhängigkeiten in benannten Volumes ab (`werkzeug-modules*`), nicht im Projektordner. Details: [Kapitel 7](07-verteilungssicht.md), [ADR 025](adr/025-docker-only-entwicklung-und-pruefung.md).

## 2.3 Organisatorisch

| Randbedingung                    | Erläuterung                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub (öffentliches Repository) | Code, Issues, CI/CD; keine Secrets im Repo (Secrets verschlüsselt mit SOPS/age im Server-Repo). Der Code steht unter keiner freien Lizenz, alle Rechte vorbehalten        |
| Issue-getriebene Arbeit          | Jede Arbeit beginnt mit einem Issue (Typ-, Schicht-, Prioritäts-Label, Definition of Done), der Pull Request schließt es                                                  |
| Trunk-based mit Pull Requests    | `main` geschützt, Merge nur bei grünem **Quality Gate**; Veröffentlichen = Merge auf `main`                                                                               |
| Geteilter Hetzner-Server         | Server `demos-01` mit weiterem Stack „prioliste“ und zentralem Caddy auf 80/443. Fremde Stacks nie ändern, stoppen oder löschen, kein `docker system prune`               |
| Updates ohne Datenverlust        | Ab Go-live (Oktober 2026) keine Änderung an Nutzerdaten und Zugängen: Migrationen nur additiv, Freigabe-Kommentar für Ausnahmen, Upgrade-Test, Sicherung vor jedem Update |
| OpenStreetMap-Daten (ODbL)       | Ortsverzeichnis mit Koordinaten aus OSM: Quellenangabe „© OpenStreetMap-Mitwirkende“ im Footer und auf jeder Karte; Kacheln nach der OSM-Tile-Usage-Policy                |
| Nur eigene Recherche             | Keine Übernahme fremder Terminsammlungen (Datenbankherstellerrecht, §§ 87a ff. UrhG); Quelle je Termin wird gespeichert (ADR 009)                                         |
| Kein Tracking                    | Keine Werbung, nur technisch notwendige Cookies; gezählt werden Seitenaufrufe je Tag ohne IP-Adresse                                                                      |

## 2.4 Rechtliche Randbedingungen

- DSGVO: Gespeichert werden nur Anzeigename, Rolle, Passkey-Daten (öffentlicher Schlüssel) und die von Meldenden freiwillig angegebenen Inhalte. Fotos und Plakate werden verkleinert und von Metadaten (z. B. GPS) befreit.
- Impressum und Datenschutzerklärung sind Seiten der Website (`impressum.astro`, `datenschutz.astro`).
- Erziehungsbeauftragung („Muttizettel“) nach § 1 Abs. 1 Nr. 4 JuSchG wird nur als Vorlage bereitgestellt.
- Sicherheitslücken: Meldeweg in `SECURITY.md`.

## 2.5 Konventionen

- Fehlerantworten der API im Format Problem Details (RFC 9457).
- Konfiguration ausschließlich aus Umgebungsvariablen (12-Factor). Unvollständige Konfiguration (SMTP, VAPID) ist ein Startfehler, keine stille Abschaltung.
- Alle GitHub-Actions auf Commit-SHAs gepinnt, Dependabot hält sie aktuell.
- Fachbegriffe, Bezeichner und Kommentare überwiegend deutsch.
