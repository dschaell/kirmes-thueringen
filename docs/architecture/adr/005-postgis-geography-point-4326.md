# ADR 005: PostGIS `geography(Point, 4326)`

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

PostGIS `geography(Point, 4326)`.

## Begründung

Umkreissuche in Metern, GiST-Index, Standard-Koordinaten von OSM

## Verworfene Alternativen

Lat/Lon als zwei `numeric`-Spalten
