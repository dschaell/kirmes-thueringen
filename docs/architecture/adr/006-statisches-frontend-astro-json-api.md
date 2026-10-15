# ADR 006: Statisches Frontend (Astro) + JSON-API

- **Status:** abgelöst durch Server-Rendering (Astro SSR, Issue #2) – Website rendert serverseitig aus der API; die JSON-API bleibt
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Statisches Frontend (Astro) + JSON-API.

## Begründung

SEO pro Ort, schnell, CDN-fähig; Interaktivität nur wo nötig

## Verworfene Alternativen

SPA (schlechtere Auffindbarkeit), SSR-Server (mehr Betrieb)
