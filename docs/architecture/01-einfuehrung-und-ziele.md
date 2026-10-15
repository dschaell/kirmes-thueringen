# 1. Einführung und Ziele

## 1.1 Aufgabenstellung

Der Kirmeskalender Thüringen ist eine **Single-Purpose-Webanwendung**: Er macht alle Kirmes-Termine
in Thüringen (Kirmestanz, Kindertanz, Zeltkirmes, Brauchtum) **such-, filter- und verwaltbar** – nach
Ort, Landkreis, Zeitraum und Art der Veranstaltung. Die Termine stammen aus eigener Recherche
der Redaktion und von den Kirmesgesellschaften selbst.

Nicht Teil des Systems (bewusst ausgeschlossen): Ticketverkauf, Kommentare, allgemeine
Veranstaltungen ohne Kirmesbezug, Termine außerhalb Thüringens.

| ID  | Kernanforderung                                                                 |
| --- | ------------------------------------------------------------------------------- |
| F1  | Termine suchen (Freitext: Ort, Band, Veranstaltung)                             |
| F2  | Filtern nach Landkreis (Regionen-Tagging), Zeitraum, Kategorie, „nur bestätigt“ |
| F3  | Ortsseiten (`/orte/<ort>`) und Landkreisseiten für Suchmaschinen                |
| F4  | Kartenansicht der Kirmesorte (OpenStreetMap)                                    |
| F5  | Kalender-Abo (iCal)                                                             |
| F6  | Verwaltung: Termine anlegen, bestätigen, korrigieren (authentifiziert)          |

## 1.2 Qualitätsziele

| Priorität | Qualitätsziel      | Motivation                                                                                                                 |
| --------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1         | **Wartbarkeit**    | Ehrenamtliches Projekt mit wechselnden Mitwirkenden: Code muss ohne Vorwissen verständlich, testbar und austauschbar sein. |
| 2         | **Sicherheit**     | Öffentlich erreichbar, Verwaltungszugang, personenbezogene Kontaktdaten von Veranstaltern (DSGVO).                         |
| 3         | **Korrektheit**    | Falsche Termine schaden Vereinen und Besuchern; unbestätigte Termine müssen als solche erkennbar sein.                     |
| 4         | **Auffindbarkeit** | „Kirmes Mühlberg 2026“ muss in Suchmaschinen gefunden werden.                                                              |

## 1.3 Stakeholder

| Rolle                        | Erwartung                                                          |
| ---------------------------- | ------------------------------------------------------------------ |
| Besucher:innen               | Schnell die nächste Kirmes in der Nähe finden, mobil               |
| Kirmesgesellschaften/Vereine | Eigene Termine einfach melden und korrigieren                      |
| Redaktion (Betreiber)        | Termine prüfen, freigeben, pflegen – mit wenig Aufwand             |
| Entwickler:innen             | Klare Schichten, schnelle Tests, automatisierte Qualitätssicherung |
