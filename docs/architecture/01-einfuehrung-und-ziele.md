# 1. Einführung und Ziele

## 1.1 Aufgabenstellung

Der Kirmeskalender Thüringen macht alle Kirmes-Termine in Thüringen **such-, filter- und verwaltbar**: nach Ort, Landkreis, Zeitraum und Art. Er ist öffentlich lesbar, kostenlos, ohne Werbung und ohne Tracking. Gepflegt wird er von der Redaktion, von den Kirmesgesellschaften selbst (eigenes Konto mit Passkey) und mit Hinweisen von Besuchern. Betreiber ist eine Einzelperson, die Termine entstehen aus eigener Recherche und aus Meldungen.

Warum es ihn gibt: Kirmes ist von Ostern bis November fast jedes Wochenende irgendwo, die Termine stehen aber verstreut in Instagram-Storys, WhatsApp-Gruppen, Amtsblättern und auf Plakaten. Ein früherer Kalender wurde nicht fortgeführt.

Nicht Teil des Systems (bewusst ausgeschlossen): Ticketverkauf, Kommentare, allgemeine Veranstaltungen ohne Kirmesbezug, Termine außerhalb Thüringens, Werbung, Nutzerprofile von Besuchern.

## 1.2 Funktionale Anforderungen

| ID  | Anforderung                                                                                                                       | Umsetzung (Auszug)                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| F1  | Termine suchen (Freitext: Ort, Band, Veranstaltung) mit Vorschlägen                                                               | `suche-termine.ts`, `/termine`, `/suche-vorschlaege.json`                                    |
| F2  | Filtern nach Landkreis, Zeitraum, Kategorie (`tanz`, `party`, `familie`, `tradition`, `fruehschoppen`, `staendchen`, `sonstiges`) | Core `domain/termin.ts`, GET-Formular ohne JavaScript                                        |
| F3  | Orts- und Landkreisseiten, Terminseiten für Suchmaschinen (schema.org/JSON-LD, Sitemap)                                           | `pages/orte`, `pages/kreise`, `pages/termin`, `sitemap.xml.ts`                               |
| F4  | Karte aller Orte mit kommenden Terminen, „In meiner Nähe“                                                                         | `karte.astro`, PostGIS `geography(Point, 4326)`                                              |
| F5  | Kalender-Abo (iCal) für Thüringen, einen Landkreis oder einen Ort; Termine merken, teilen                                         | `kalender.ics.ts`, `gemerkt.astro`                                                           |
| F6  | Termin oder Korrektur melden, ohne Anmeldung (Vorschläge, Korrekturen)                                                            | `termin-melden`, `vorschlaege.ts`, `korrekturen.ts`, Meldung per SMTP an die Redaktion       |
| F7  | Redaktion: Termine anlegen (auch ganzes Kirmeswochenende), bestätigen, korrigieren, importieren (CSV), Mitteilungen               | `/admin`, `redaktions-termine.ts`, `termine-verwalten.ts`, `recherche.ts`                    |
| F8  | Kirmesgesellschaften pflegen ihren Ort: Termine, Plätze mit Kartenpunkt, Ortsprofil, Plakate/Flyer, Beiträge mit Fotos            | Rollenmodell (`rechte.ts`), `festplaetze.ts`, `ortsprofile.ts`, `plakate.ts`, `beitraege.ts` |
| F9  | Mitgliederverwaltung: Einladungen, Mitmach-Anfragen annehmen oder ablehnen, Rollen                                                | `mitglieder.ts`, `mitmach-anfragen.ts`, `einrichtung.ts`                                     |
| F10 | Push-Benachrichtigungen (Web Push, freiwillig)                                                                                    | `push.ts`, VAPID, `push-versand.ts`                                                          |
| F11 | Muttizettel (Erziehungsbeauftragung) als Vorlage zum Drucken                                                                      | `muttizettel.astro`                                                                          |
| F12 | Wochenbild für Instagram/WhatsApp, einbettbares Widget für Vereins- und Gemeindeseiten                                            | `wochenbild.png.ts`, `pages/einbetten`                                                       |
| F13 | Zugriffszahlen ohne Tracking (nur Seitenaufrufe je Tag, ohne IP)                                                                  | `zugriffe.ts`, Migration 039                                                                 |
| F14 | Sicherungsstatus für Admins (letzte Sicherung, Offsite-Kopie)                                                                     | `sicherungen.ts`, `status.json` des Backup-Dienstes                                          |

Bewusst entfernt: Bearbeitungslinks ohne Konto (Issue #355). Kirmesgesellschaften pflegen jetzt mit eigenem Konto und Passkey.

## 1.3 Qualitätsziele

| Priorität | Qualitätsziel          | Motivation                                                                                                                                                                  |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | **Datenhaltbarkeit**   | Updates dürfen Daten und Zugänge der Nutzer nie verändern. Migrationen sind nur ergänzend, ein Upgrade-Test vergleicht jede Zeile, vor jedem Update gibt es eine Sicherung. |
| 2         | **Sicherheit**         | Öffentlich erreichbar, Redaktionszugang, personenbezogene Daten der Mitglieder (Anzeigename, Passkey), DSGVO.                                                               |
| 3         | **Wartbarkeit**        | Ehrenamtliches Projekt mit wechselnden Mitwirkenden: Clean Architecture, Fachlogik ohne Datenbank testbar, Schichtregeln in der CI.                                         |
| 4         | **Korrektheit**        | Falsche Termine schaden Vereinen und Besuchern. Bestätigte Angaben sind von recherchierten klar unterscheidbar.                                                             |
| 5         | **Auffindbarkeit**     | „Kirmes Mühlberg 2026“ muss in Suchmaschinen gefunden werden (eine Seite pro Ort und Termin, schema.org, Sitemap).                                                          |
| 6         | **Reproduzierbarkeit** | Alles läuft ausschließlich in Docker, lokal wie auf dem Server. Kein Node.js oder PostgreSQL auf dem Rechner nötig.                                                         |

## 1.4 Stakeholder

| Rolle                          | Erwartung                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Besucher:innen                 | Schnell die nächste Kirmes finden, mobil, ohne Anmeldung und ohne Tracking                           |
| Kirmesgesellschaften / Vereine | Eigene Termine einfach pflegen, als bestätigt gelten, Gäste aus Nachbarorten erreichen               |
| Redaktion                      | Termine prüfen, freigeben, pflegen, Vorschläge und Korrekturen bearbeiten, mit wenig Aufwand         |
| Admin (Betreiber)              | Mitglieder, Einladungen, Sicherungen; ruhiger Betrieb, nachvollziehbare Änderungen                   |
| Mitnutzer des Servers          | Der Server wird geteilt (Stack „prioliste“ mit zentralem Caddy). Nichts Fremdes darf berührt werden. |
| Entwickler:innen               | Klare Schichten, schnelle Tests, automatisierte Qualitätssicherung, ein Befehl je Aufgabe            |
| Suchmaschinen, Kalender-Apps   | Maschinenlesbare Seiten (JSON-LD, Sitemap, iCal)                                                     |
