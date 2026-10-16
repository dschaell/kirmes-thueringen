# ADR 023: Redaktion nur mit Passkey, Rollen und Einladungen

- **Status:** angenommen (ersetzt [ADR 016](016-admin-mit-passwort-totp-sitzung-im-httponly-cookie.md))
- **Kontext:** [Issue #56](https://github.com/dschaell/kirmes-thueringen/issues/56), [arc42 Kap. 8](../08-querschnittliche-konzepte.md)

## Entscheidung

- Anmeldung für Admin und Redaktion **nur mit Passkey** (WebAuthn, Benutzerverifikation Pflicht,
  discoverable credential). Kein Passwort, kein TOTP, keine E-Mail-Adresse.
- Gespeichert wird je Mitglied: selbst gewählter Anzeigename, Rolle (`admin`/`redaktion`), zufällige
  Kennung (WebAuthn `user.id`), Zeitstempel; je Passkey der öffentliche Schlüssel.
- **Rollen:** Redaktion pflegt Termine, Orte, Mitteilungen, Bearbeitungslinks. Nur Admins verwalten
  Mitglieder (einladen, Rolle ändern, entfernen). Mindestens ein Admin bleibt immer; der letzte
  Passkey eines Mitglieds lässt sich nicht löschen.
- **Neue Mitglieder** nur per Einladungslink eines Admins (256 Bit, nur SHA-256 gespeichert,
  einmalig, 7 Tage, widerrufbar). Konto + erster Passkey + Verbrauch der Einladung in einer
  Transaktion (Zeilensperre). Öffentliche Anfrage „Mitmachen“ geht nur als Mail ans
  Redaktionspostfach – der Admin entscheidet.
- **Erster Admin / Notfall:** Link ans feste Redaktionspostfach (30 min, einmalig, gedrosselt),
  solange kein Admin existiert (Advisory Lock gegen zwei Erstkonten).

## Begründung

Passkeys sind phishing-resistent (an die Domain gebunden), ersetzen beide Faktoren und erlauben
einen Zugang ganz ohne personenbezogene Daten. Mehrere Mitglieder brauchen Rollen, damit nicht jede
Person andere aufnehmen oder entfernen kann.

## Folgen

- Wer alle Passkeys verliert, bekommt eine neue Einladung (Synchronisation über iCloud/Google
  macht das selten). Ohne Admin bleibt die Ersteinrichtung als Notweg über das Postfach.
- Migration 010 entfernt Konten ohne Passkey und die Spalten `email`, `passwort_hash`,
  `totp_geheimnis`.

## Verworfene Alternativen

Passwort + TOTP behalten (speichert E-Mail, phishbar), Wiederherstellungscodes (zusätzliches
Geheimnis zum Verwalten), externer Identitätsanbieter (Daten bei Dritten).
