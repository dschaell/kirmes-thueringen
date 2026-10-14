# 6. Laufzeitsicht

## 6.1 Termine suchen (Normalfall)

```mermaid
sequenceDiagram
  participant B as Browser
  participant H as HTTP-Adapter (Fastify)
  participant U as SucheTermine (Core)
  participant R as PgTerminRepository
  participant D as PostgreSQL
  B->>H: GET /api/v1/termine?landkreis=GTH&q=Kindertanz
  H->>H: JSON-Schema prüfen (unbekannte Parameter → 400)
  H->>U: ausfuehren({ landkreise:["GTH"], q:"Kindertanz" })
  U->>U: baueFilter: Datum, Bereich ≤ 366 Tage, Landkreis ∈ Thüringen
  U->>R: suche(TerminFilter)
  R->>D: statisches SELECT … WHERE … ANY($3) … ILIKE $5
  D-->>R: Zeilen + count(*) OVER ()
  R-->>U: Seite<Termin>
  U-->>H: ok(Seite)
  H-->>B: 200 { gesamt, termine[] } · Cache-Control: max-age=300
```

## 6.2 Ungültige Filter

`SucheTermine` sammelt **alle** Fehler (z. B. `BEREICH_UMGEKEHRT`, `LANDKREIS_UNBEKANNT`) und gibt
sie als `Result` zurück. Der HTTP-Adapter antwortet `400 application/problem+json` mit der
Fehlerliste; das Repository wird nicht aufgerufen.

## 6.3 Datenbank fällt aus

```mermaid
sequenceDiagram
  participant B as Browser
  participant H as HTTP-Adapter
  participant R as PgTerminRepository
  participant D as PostgreSQL
  B->>H: GET /api/v1/termine
  H->>R: suche(...)
  R-xD: Verbindung (Timeout 3 s / ECONNREFUSED)
  R-->>H: throw PersistenzNichtVerfuegbar(cause)
  H->>H: log.error (mit Ursache, ohne Nutzerdaten)
  H-->>B: 503 Problem Details · Retry-After: 30
  Note over H: /health/ready → 503, Orchestrator nimmt Instanz aus dem Load-Balancer
```

## 6.4 Termin anlegen (Verwaltung)

`LegeTerminAn` validiert über `validiereTermin` (harte Regeln → Fehler, Auffälligkeiten →
Hinweise, z. B. `KIRMES_AUSSERHALB_HERBST`) und speichert erst danach. Der HTTP-Endpunkt ist
noch nicht freigeschaltet, da die Authentifizierung fehlt (Kapitel 11, Issue „AuthN/AuthZ“).
