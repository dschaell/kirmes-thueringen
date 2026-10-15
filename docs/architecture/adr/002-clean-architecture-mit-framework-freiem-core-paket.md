# ADR 002: Clean Architecture mit framework-freiem Core-Paket

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Clean Architecture mit framework-freiem Core-Paket.

## Begründung

Fachregeln testbar ohne DB; Frameworks austauschbar

## Verworfene Alternativen

Fastify-Handler mit eingebetteter Logik (schnell, aber schwer testbar)
