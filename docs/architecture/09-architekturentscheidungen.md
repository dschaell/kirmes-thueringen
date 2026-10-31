# 9. Architekturentscheidungen

Jede Entscheidung steht als eigene Datei im [MADR-Format](https://adr.github.io/madr/) unter
[`adr/`](adr/). Neue Entscheidungen bekommen die nächste Nummer, bestehende werden nicht
umgeschrieben, sondern über ihren **Status** abgelöst. Die Nummern 010–013 sind nicht vergeben.

| ADR                                                                            | Entscheidung                                                      | Status        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------- |
| [001](adr/001-typescript-in-allen-schichten.md)                                | TypeScript in allen Schichten                                     | angenommen    |
| [002](adr/002-clean-architecture-mit-framework-freiem-core-paket.md)           | Clean Architecture mit framework-freiem Core-Paket                | angenommen    |
| [003](adr/003-kein-orm-statisches-sql-mit-pg.md)                               | Kein ORM, statisches SQL mit `pg`                                 | angenommen    |
| [004](adr/004-optionale-filter-ueber-cardinality-n-0-statt-dynamischem-sql.md) | Optionale Filter über `cardinality($n) = 0` statt dynamischem SQL | angenommen    |
| [005](adr/005-postgis-geography-point-4326.md)                                 | PostGIS `geography(Point, 4326)`                                  | angenommen    |
| [006](adr/006-statisches-frontend-astro-json-api.md)                           | Statisches Frontend (Astro) + JSON-API                            | abgelöst      |
| [007](adr/007-semgrep-statt-codeql-als-sast.md)                                | Semgrep statt CodeQL als SAST                                     | angenommen    |
| [008](adr/008-ersatz-fuer-p-security-policy.md)                                | Ersatz für „p/security-policy“                                    | angenommen    |
| [009](adr/009-nur-eigene-recherche-keine-uebernahme-fremder-terminsammlung.md) | Nur eigene Recherche, keine Übernahme fremder Terminsammlungen    | angenommen    |
| [014](adr/014-ortsverzeichnis-aus-openstreetmap-odbl.md)                       | Ortsverzeichnis aus OpenStreetMap (ODbL)                          | angenommen    |
| [015](adr/015-recherche-als-csv-tabelle-statt-redaktionsoberflaeche.md)        | Recherche als CSV-Tabelle statt Redaktionsoberfläche              | ergänzt       |
| [016](adr/016-admin-mit-passwort-totp-sitzung-im-httponly-cookie.md)           | Admin mit Passwort + TOTP, Sitzung im HttpOnly-Cookie             | ersetzt (023) |
| [017](adr/017-recherche-assistent-statt-instagram-auslesen.md)                 | Recherche-Assistent statt Instagram-Auslesen                      | angenommen    |
| [018](adr/018-passkeys-webauthn-als-zusaetzlicher-admin-login.md)              | Passkeys (WebAuthn) als zusätzlicher Admin-Login                  | angenommen    |
| [019](adr/019-meldungen-an-die-redaktion-per-smtp-ueber-brevo.md)              | Meldungen an die Redaktion per SMTP über Brevo                    | angenommen    |
| [020](adr/020-osv-scanner-statt-owasp-dependency-check-fuer-die-sca.md)        | OSV-Scanner statt OWASP Dependency-Check für die SCA              | angenommen    |
| [021](adr/021-api-datenbankrolle-ohne-ddl-kein-tls-im-internen-docker-netz.md) | API-Datenbankrolle ohne DDL, kein TLS im internen Docker-Netz     | angenommen    |
| [022](adr/022-rate-limit-in-der-website-statt-caddy-modul.md)                  | Rate-Limit in der Website statt Caddy-Modul                       | angenommen    |
| [023](adr/023-redaktion-nur-mit-passkey-rollen-und-einladungen.md)             | Redaktion nur mit Passkey, Rollen und Einladungen                 | angenommen    |
| [024](adr/024-push-mit-web-push-und-vapid.md)                                  | Push-Benachrichtigungen mit Web Push (VAPID) und `web-push`       | angenommen    |
