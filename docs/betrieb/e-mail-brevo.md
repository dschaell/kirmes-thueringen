# E-Mail-Versand mit Brevo

Die Formulare „Termin melden“ und „Link für den Festplatz anfordern“ schicken Meldungen per SMTP
über **Brevo** an das Postfach der Redaktion. Empfänger und Absender stehen nur in der
Konfiguration – das Formular kann keine Mails an Dritte auslösen (kein offenes Relay).
Ohne Konfiguration zeigt die Website bei einer Meldung den Weg über `mailto:` an.

## Einrichten (einmalig)

1. **Brevo-Konto** anlegen (kostenloser Tarif reicht: 300 Mails/Tag).
2. **Auftragsverarbeitungsvertrag (AVV):** ist bei Brevo Teil der Nutzungsbedingungen (Anhang 3 „Datenschutzvereinbarung“) und gilt mit der Kontoeröffnung – die Fassung als PDF ablegen. Zwei-Faktor-Anmeldung im Brevo-Konto einschalten.
3. **Absender-Domain verifizieren:** Brevo → _Absender, Domains & dedizierte IPs_ → _Domains_ →
   Domain hinzufügen und die angezeigten DNS-Einträge beim Domain-Anbieter setzen
   (Brevo-Code, **DKIM**, **DMARC**; SPF nach Vorgabe). Erst danach landen Mails nicht im Spam.
4. **Absender** anlegen, z. B. `noreply@deine-domain.de`.
5. **SMTP-Schlüssel** erzeugen: Brevo → _Einstellungen_ → _SMTP & API_ → _SMTP_ →
   „Neuen SMTP-Schlüssel erstellen“. Login (`…@smtp-brevo.com`) und Schlüssel notieren.

## Konfiguration (Server, Datei `.env` neben `docker-compose.yml`)

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=xxxxxx@smtp-brevo.com
SMTP_PASS=<SMTP-Schlüssel>
MAIL_FROM="Kirmeskalender Thüringen <noreply@deine-domain.de>"
MAIL_AN=redaktion@deine-domain.de
```

Danach `docker compose … up -d api`. Fehlt eine der Variablen `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`, `MAIL_AN`, während andere gesetzt sind, startet die API bewusst nicht.

Die Verbindung ist immer verschlüsselt (Port 587 mit erzwungenem STARTTLS, Port 465 mit TLS).
Der SMTP-Schlüssel gehört nur in die `.env` auf dem Server – nie ins Repository. Wird er bekannt:
in Brevo löschen, neuen erzeugen, `.env` anpassen.

## Missbrauchsschutz

- Unsichtbares Fallen-Feld und Mindest-Ausfüllzeit (3 s) – Bots werden still verworfen
- Höchstens 5 Meldungen je Besucher-IP und 100 insgesamt pro Stunde (HTTP 429)
- Betreff ohne Zeilenumbrüche (keine Header-Injection), Antwort-Adresse wird geprüft

## Lokal testen ohne echten Versand

```bash
docker compose --profile mail up -d mailpit
```

API mit `SMTP_HOST=localhost SMTP_PORT=1025 SMTP_OHNE_TLS=nur-lokal` (plus Benutzer, Passwort,
`MAIL_FROM`, `MAIL_AN` beliebig) starten; alle Mails erscheinen unter http://localhost:8025.
`SMTP_OHNE_TLS` wird für jeden anderen Host als `localhost`/`mailpit` abgelehnt.
