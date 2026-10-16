# ADR 021: API-Datenbankrolle ohne DDL, kein TLS im internen Docker-Netz

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

API-Datenbankrolle ohne DDL, kein TLS im internen Docker-Netz.

## Begründung

Least Privilege: kompromittierte API kann keine Tabellen löschen oder ändern; Rechte versioniert in Migration 009; Datenbank ohne Port nach außen auf demselben Host → TLS ohne Schutzgewinn, bei externer DB per DB_SSL erzwingbar

## Verworfene Alternativen

Ein Owner-User für alles (bisher); TLS mit selbstsignierten Zertifikaten im internen Netz (Aufwand ohne Nutzen)
