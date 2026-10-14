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

`VerwalteTermine` (Bearbeitungslink) bzw. `Redaktion` (Admin) validieren über `validiereTermin`
(harte Regeln → Fehler, Auffälligkeiten → Hinweise, z. B. `KIRMES_AUSSERHALB_HERBST`) und
speichern erst danach über den Port `TerminVerwaltung`; jede Änderung wird protokolliert.

### Kirmeswochenende (mehrere Veranstaltungen auf einmal)

```mermaid
sequenceDiagram
  participant R as Redaktion (Browser)
  participant W as Website /admin/termine
  participant A as API
  participant C as Core (validiereAlle)
  participant D as PostgreSQL
  R->>W: POST Formular (Zeilen: Datum, Beginn, Titel, Band, Hinweise) + CSRF
  W->>A: POST /api/v1/admin/termine/wochenende {ortSlug, zeilen[]}
  A->>C: legeWochenende
  C-->>A: Fehler „Zeile n: …“ (+ DOPPELT) → 400, nichts gespeichert
  C->>D: legeAlle – BEGIN · INSERT … je Zeile · Protokoll · COMMIT
  D-->>C: bei Fehler ROLLBACK (alle oder keiner)
  A-->>W: 201 {termine, hinweise}
```

Höchstens 20 Veranstaltungen je Aufruf. Kirmesgesellschaften haben denselben Ablauf über
`POST /api/v1/verwaltung/termine/wochenende`.

## 6.5 Kirmesgesellschaft trägt ihren Festplatz ein

```mermaid
sequenceDiagram
  participant K as Kirmesgesellschaft (Browser)
  participant W as Website /verwalten
  participant A as API
  participant D as PostgreSQL
  Note over K: öffnet …/verwalten#k=TOKEN<br/>(Fragment wird nie an Server gesendet)
  K->>K: Token → sessionStorage, Fragment aus URL entfernen
  K->>W: GET /verwalten/festplaetze (Authorization: Bearer TOKEN)
  W->>A: GET /api/v1/verwaltung/festplaetze (Header weitergereicht)
  A->>D: UPDATE bearbeitungslink … WHERE token_hash = sha256(TOKEN) AND nicht gesperrt
  D-->>A: Ort des Links
  A-->>K: Ort, Festplätze, Veranstaltungsorte
  K->>W: PUT {name, lat, lon}
  W->>A: PUT /api/v1/verwaltung/festplaetze
  A->>A: Koordinate in Thüringen? Name ≤ 120 Zeichen?
  A->>D: UPSERT festplatz + INSERT aenderungsprotokoll (eine Transaktion)
  Note over A,D: Ab jetzt liefert jede Terminabfrage den Festplatz mit;<br/>„Route“ führt zu den exakten Koordinaten
```
