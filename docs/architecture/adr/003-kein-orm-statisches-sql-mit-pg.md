# ADR 003: Kein ORM, statisches SQL mit `pg`

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Kein ORM, statisches SQL mit `pg`.

## Begründung

SQL ist sichtbar, reviewbar und durch Semgrep prüfbar; keine Magie

## Verworfene Alternativen

Prisma/TypeORM (Abstraktion verdeckt Abfragen und Indexnutzung)
