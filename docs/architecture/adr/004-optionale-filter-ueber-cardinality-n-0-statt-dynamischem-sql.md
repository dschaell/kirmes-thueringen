# ADR 004: Optionale Filter über `cardinality($n) = 0` statt dynamischem SQL

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Optionale Filter über `cardinality($n) = 0` statt dynamischem SQL.

## Begründung

SQL bleibt eine Konstante → strukturell keine Injection

## Verworfene Alternativen

Query-Builder mit String-Verkettung
