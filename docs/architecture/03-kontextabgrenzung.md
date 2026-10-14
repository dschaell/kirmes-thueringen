# 3. Kontextabgrenzung

## 3.1 Fachlicher Kontext

Das System ist der zentrale, öffentlich lesbare Kalender für Kirmesveranstaltungen in Thüringen.
Es **verwaltet** Termine, Orte, Landkreise und Veranstalter – es **organisiert keine**
Veranstaltungen und verkauft keine Tickets.

```mermaid
flowchart LR
  B([Besucher:in]) -- "sucht/filtert Termine,<br/>abonniert Kalender" --> S
  V([Kirmesgesellschaft /<br/>Veranstalter]) -- "meldet Termin (E-Mail/Formular)" --> R
  R([Redaktion]) -- "legt an, bestätigt,<br/>korrigiert Termine" --> S
  S[[Kirmeskalender<br/>Thüringen]]
  S -- "Kartenkacheln, Geokoordinaten" --- OSM[(OpenStreetMap)]
  S -- "Ortsseiten, Events (schema.org)" --> SM([Suchmaschinen])
  S -- "iCal-Feed" --> K([Kalender-Apps])
  A[(Alter Kirmeskalender<br/>mauersberger-haarhausen.de)] -. "einmaliger Import" .-> S
```

| Kommunikationspartner           | Eingabe an das System                           | Ausgabe des Systems                                                                |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Besucher:in                     | Suchtext, Landkreis(e), Zeitraum, Kategorie     | Terminlisten, Ortsseiten, Karte                                                    |
| Kirmesgesellschaft/Veranstalter | Terminmeldung (Ort, Datum, Uhrzeit, Titel)      | Veröffentlichter Termin, Status „bestätigt“                                        |
| Redaktion                       | Anlegen/Ändern/Bestätigen von Terminen          | Validierungsfehler, fachliche Hinweise (z. B. „Kirmes außerhalb der Herbstsaison“) |
| OpenStreetMap (optional)        | Koordinaten der Orte (Geocoding), Kartenkacheln | Attribution „© OpenStreetMap-Mitwirkende“                                          |
| Suchmaschinen                   | –                                               | HTML mit schema.org-`Event`, Sitemap                                               |
| Kalender-Apps                   | –                                               | `text/calendar` (RFC 5545)                                                         |
| Alter Kirmeskalender            | HTML-Tabelle (einmaliger Import)                | –                                                                                  |

**Fachliche Grenze:** Das System kennt ausschließlich die **23 Thüringer Landkreise und
kreisfreien Städte** (Kfz-Kennzeichen als Schlüssel, `packages/core/src/domain/landkreis.ts`).
Orte außerhalb Thüringens werden bei der Validierung abgewiesen.

## 3.2 Technischer Kontext

```mermaid
flowchart LR
  subgraph Internet
    Browser[Browser]
    Crawler[Suchmaschinen-Crawler]
    Cal[Kalender-Client]
  end
  subgraph System["Kirmeskalender (eigene Infrastruktur)"]
    Web["Client-Tier<br/>nginx + statisches Astro-Frontend<br/>:8080"]
    API["Server-Tier<br/>Fastify-API (Node.js)<br/>:3000"]
    DB[("Data-Tier<br/>PostgreSQL 17 + PostGIS<br/>:5432 (intern)")]
  end
  Tiles[(tile.openstreetmap.org)]
  Nom[(Nominatim-Geocoder)]

  Browser -- "HTTPS GET (HTML/CSS/JS)" --> Web
  Crawler -- "HTTPS GET" --> Web
  Cal -- "HTTPS GET /kalender.ics" --> Web
  Browser -- "HTTPS GET /api/v1/termine (JSON)" --> API
  Browser -- "HTTPS GET Kacheln" --> Tiles
  API -- "TCP/TLS, SQL mit Parametern (pg)" --> DB
  API -. "Batch-Geocoding, ≤ 1 req/s" .-> Nom
```

| Kanal                 | Protokoll / Format                         | Sicherheit                                                                        |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Browser → Web         | HTTPS, HTML/CSS/JS                         | TLS am Reverse-Proxy, CSP ohne `unsafe-inline`, HSTS                              |
| Browser → API         | HTTPS, JSON, RFC 9457 Problem Details      | CORS-Allowlist, Rate-Limit 120/min/IP, Helmet-Header                              |
| API → PostgreSQL      | PostgreSQL-Wire-Protokoll (TLS in Prod)    | nur internes Netz, eigener DB-User mit Minimalrechten, parametrisierte Statements |
| Browser → OSM-Kacheln | HTTPS, PNG                                 | Nur Lesezugriff, keine Nutzerdaten; CSP `img-src` wird dafür erweitert            |
| API → Nominatim       | HTTPS, JSON (nur Batch, nicht pro Request) | Ergebnis wird in `ort.lage` gespeichert, keine Laufzeitabhängigkeit               |

**Technische Grenze:** Die Datenbank ist nie direkt von außen erreichbar. OpenStreetMap ist
**optional**: Fällt OSM aus, funktionieren Suche, Listen und Ortsseiten weiter; nur die Karte
bleibt leer (siehe [Kapitel 8.3](08-querschnittliche-konzepte.md#83-fehlerbehandlung-und-resilienz)).
