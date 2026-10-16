# ADR 019: Meldungen an die Redaktion per SMTP über Brevo

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Meldungen an die Redaktion per SMTP über Brevo.

## Begründung

Formular funktioniert ohne eigenes Mailprogramm; Brevo: EU-Anbieter, AVV in den Nutzungsbedingungen, eigener SMTP-Schlüssel statt Postfach-Passwort, Zustellprotokoll; Empfänger fest konfiguriert (kein offenes Relay)

## Verworfene Alternativen

mailto (setzt Mailprogramm voraus); IONOS-Postfach-SMTP (Postfach-Passwort auf dem Server, kaum Zustellkontrolle); eigener Mailserver
