# ADR 020: OSV-Scanner statt OWASP Dependency-Check für die SCA

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

OSV-Scanner statt OWASP Dependency-Check für die SCA.

## Begründung

Dependency-Check lädt 408.000 NVD-Einträge über die NVD-API – im CI ~4 h, Job brach immer ab; OSV-Scanner (osv.dev: GitHub-Advisories, npm, NVD) läuft in Sekunden ohne API-Schlüssel; npm audit bleibt

## Verworfene Alternativen

Dependency-Check mit längerem Timeout oder NVD-Spiegel (langsam, wartungsintensiv); nur npm audit (eine Quelle)
