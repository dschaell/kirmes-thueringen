# ADR 016: Admin mit Passwort + TOTP, Sitzung im HttpOnly-Cookie

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Admin mit Passwort + TOTP, Sitzung im HttpOnly-Cookie.

## Begründung

Ein einziger, mächtiger Zugang verdient zwei Faktoren; TOTP ohne externe Dienste und ohne Abhängigkeiten umsetzbar

## Verworfene Alternativen

Login per E-Mail-Link (abhängig vom Postfach), externer Identitätsanbieter (Overhead für ein Ein-Personen-Team)
