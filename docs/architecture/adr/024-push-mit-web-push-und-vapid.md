# ADR 024: Push-Benachrichtigungen mit Web Push (VAPID) und `web-push`

- **Status:** angenommen
- **Kontext:** Issue #348 – Kirmes folgen, gemerkte Termine melden, Erinnerung am Vortag; auch als
  Home-Bildschirm-App (PWA)

## Entscheidung

Standard-Web-Push (RFC 8030/8291/8292) mit eigenem VAPID-Schlüsselpaar, Versand über die
Bibliothek `web-push`. Je Gerät nur Endpunkt, Schlüssel, gefolgte Orte, gemerkte Termin-IDs.
Endpunkte nur von den Push-Diensten der Browser (Apple, Google, Mozilla, Microsoft). Ohne
Schlüssel in der Umgebung bleibt Push vollständig ausgeschaltet.

## Begründung

Kein Konto, keine Mail-Adresse und kein Drittanbieter-SDK nötig; Inhalt Ende-zu-Ende
verschlüsselt; funktioniert auf Android, Desktop und – als Home-Bildschirm-App – ab iOS 16.4.
`web-push` ist die verbreitete Referenzumsetzung (MPL-2.0) und erspart eigene Kryptografie.
Allowlist der Push-Dienste verhindert, dass der Server an beliebige Adressen sendet (SSRF).

## Verworfene Alternativen

Firebase Cloud Messaging-SDK (Google-Konto, Tracking, nicht nötig für Web Push); E-Mail-
Benachrichtigungen (Adressen speichern, Double-Opt-in); eigene Umsetzung von VAPID/aes128gcm
(fehleranfällig, mehr Code).
