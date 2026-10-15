# ADR 015: Recherche als CSV-Tabelle statt Redaktionsoberfläche

- **Status:** ergänzt durch ADR 016 – neben der CSV-Recherche gibt es einen Redaktionsbereich und Bearbeitungslinks
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Recherche als CSV-Tabelle statt Redaktionsoberfläche.

## Begründung

Redaktion arbeitet in vertrauten Werkzeugen (Google Sheets/Excel); Import prüft alle Fachregeln, ist idempotent und hat einen Probelauf

## Verworfene Alternativen

Eigene Admin-Oberfläche (Issue #1, später)
