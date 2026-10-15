# ADR 018: Passkeys (WebAuthn) als zusätzlicher Admin-Login

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Passkeys (WebAuthn) als zusätzlicher Admin-Login.

## Begründung

Phishing-resistent und bequemer als Passwort + Code; Benutzerverifikation ersetzt beide Faktoren; Bibliothek SimpleWebAuthn statt eigener Kryptografie; Passwort + TOTP bleibt als Rückfallweg

## Verworfene Alternativen

Nur Passwort + TOTP (phishbar); OIDC-Anbieter (zusätzlicher Dienst, für eine Redaktion überdimensioniert)
