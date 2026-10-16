# Prüfung: Assistent und öffentliche Vorschläge (#70, #71)

Geprüft am 16.10.2026 in einem eigenen Compose-Projekt `kirmes-assistent-70`:
PostGIS mit eigener Datenbank `kirmes_test` und eigenem Volume, API mit eingeschränkter
Datenbankrolle, Webserver mit Produktions-CSP, Mailpit. Ausschließlich lokale Testadressen.
Die vorhandene Arbeitsdatenbank und vorhandene Zugänge wurden nicht verwendet oder geändert.

## Automatisierte Gates

- `npm run lint`: ESLint, Prettier, Migrations-Sperre und Schichtenregeln grün.
- `npm run typecheck`: grün (ein bestehender Hinweis in `kreise/[kreis].astro`).
- Vollständige Tests einschließlich PostgreSQL: 385 Tests grün.
- Coverage gegenüber separat gemessenem `main`: Zeilen 99,93 → 99,93 %, Statements
  99,58 → 99,63 %, Funktionen 100 → 100 %, Branches 96,77 → 96,87 %.
- `scripts/coverage-ratchet.mjs`: grün; keine Kennzahl gesunken.
- `scripts/upgrade-test.mjs origin/main`: 14 vorhandene Zeilen in 12 Tabellen unverändert.
- API- und Web-Produktionsimages gebaut, Server-Nachbau gesund.

## Ende zu Ende und Darstellung

Im Headless-Chrome mit **deaktiviertem JavaScript**, 375 px, alle drei Schritte in hell und dunkel:

1. Alkersleben-Testort wählen; vier Tage laden; Ständchen abwählen.
2. Frühschoppen mit Mittagstisch (Klöße, 9,50 €) und freiwilliger Kontaktadresse ergänzen.
3. Einreichen: Vorschlag gespeichert, keine öffentlichen Termine; Benachrichtigung in Mailpit.
4. Anmeldung über die Website mit echter WebAuthn-Signatur des vorhandenen Software-Authenticators.
5. Vorschlag öffnen, Titel ändern, Bestätigung setzen und übernehmen.
6. Sechs öffentliche Termine einschließlich Speisen; Name/E-Mail/Nachricht im Vorschlag sofort NULL.
7. Zweiten Vorschlag als Einzeltermin einreichen und ablehnen: niemals öffentlich, Kontakt entfernt.
8. Ungültiges öffentliches CSRF-Token: 403 ohne Speicherung.
9. Bestehendes Festplatz-Linkformular ohne JavaScript: Nachricht erfolgreich an Mailpit.

Keine Browserfehler; kein horizontaler Überlauf. Screenshots liegen neben dieser Datei.
Repository-Tests prüfen außerdem konkurrierende Einreichungen (maximal 50 offene je Ort),
atomaren Rollback bei Terminkonflikten, Sitzungsablauf und idempotentes Aufräumen nach 30/180 Tagen.

## Betrieb

Keine neuen Umgebungsvariablen oder Abhängigkeiten. Migration 013 ergänzt ausschließlich Tabellen.
Beim Start und täglich werden ausschließlich abgelaufene Vorschläge entfernt. Ein SMTP-Fehler beim
Benachrichtigen verwirft einen bereits gespeicherten Vorschlag nicht: er bleibt in der Redaktionsliste.
Die Mailbenachrichtigung wird in diesem Fall nicht automatisch wiederholt.

Noch nicht live geprüft oder veröffentlicht. Merge erst nach ausdrücklicher Betreiberfreigabe.
