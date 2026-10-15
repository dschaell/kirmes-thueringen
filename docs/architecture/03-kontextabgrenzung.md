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
  Q([Öffentliche Ankündigungen<br/>Instagram, Facebook, Amtsblatt]) -. "Recherche der Redaktion,<br/>CSV-Import" .-> S
```
