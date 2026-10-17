# Schreibkonflikte und Bedienung absichern (#85)

Basis: main `1dd1481`. Keine neuen Abhängigkeiten oder Umgebungsvariablen.

## Bestätigte Befunde und Umsetzung

| Befund                     | Verhalten nach dem Fix                                                                                                                                                                                      | Nachweis                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| R1 Neuanlage überschreibt  | Normales INSERT; Dubletten ergeben 409. Auch ein ganzes Wochenende rollt bei einer Dublette vollständig zurück.                                                                                             | PostgreSQL-Integrationstest und echte HTTP-Anfragen im Nachbau                                       |
| R2 Parallele Bearbeitung   | Geschützte Bearbeitungsantwort enthält Version aus derselben Abfrage wie die Daten. Prüfung unter Zeilensperre, Versionserhöhung in derselben Transaktion. Veraltete oder fehlende Kennung wird abgewiesen. | Parallele PUTs: genau einmal 200 und einmal 409; Browser behält Eingaben und zeigt aktuellen Stand   |
| R3 Letzter Admin           | Rollenänderung und Entfernung verwenden dieselbe transaktionale Advisory-Sperre und zählen unter dieser Sperre erneut.                                                                                      | Paralleles Herabstufen, Entfernen und gemischter Fall: genau ein Admin bleibt                        |
| R4 Tablet-Navigation       | Umbruch bereits unter 981px.                                                                                                                                                                                | 54 Ansichten über sechs Breiten ohne seitlichen Überlauf                                             |
| R5 Falsches Dropdown       | Programmatische Kategorienauswahl synchronisiert die sichtbare Auswahl, ohne eine Benutzereingabe vorzutäuschen.                                                                                            | Veranstalterformular: `familie` und sichtbarer „Kindertanz“ stimmen überein; erfolgreich gespeichert |
| R6 Verlorene Formularwerte | Alle vier Felder bleiben erhalten; Festplatzformular bleibt bei Fehlern geöffnet.                                                                                                                           | Echte 403-Antwort mit Ort, Landkreis, Kirmesgesellschaft und E-Mail; helle Browseransicht            |
| R7 Filterwechsel           | Mehrere Filter auswählen und gemeinsam anwenden; aktive Filter bleiben geöffnet.                                                                                                                            | Browser: Kindertanz und Bestätigung gemeinsam gewählt, ein Ergebnis                                  |
| R8 Mobile Tabellen         | Sichtbare Feldbeschriftungen für Einladungen, Mitglieder, Links und Mitteilungen.                                                                                                                           | Mobile Mitgliederansicht mit Passkeys, letztem Login und beschrifteten Gültigkeitsdaten              |
| R9 Mitglied entfernen      | Aufklappbare Rückfrage mit Name und Folgen, Pflichtbestätigung zusätzlich serverseitig geprüft.                                                                                                             | Unbestätigte HTTP-Aktion: 400, Mitglied unverändert; Browser-Rückfrage                               |
| R10 Dublettenfehler        | Erwartbarer Konflikt als 409 mit verständlicher Meldung.                                                                                                                                                    | Echte Neuanlage-/Umbenennungstests; Originaldaten bleiben erhalten                                   |
| R11 Löschrückfrage         | Titel, Ort, Datum und Uhrzeit sichtbar; Versionsprüfung schützt auch Bestätigen und Löschen.                                                                                                                | Browser-/HTTP-Prüfung und Tests                                                                      |

Der Versionsschutz umfasst Einzelbearbeitung, Sammeländerungen samt Löschungen, Mittagstisch, Veranstalterbereich und Bestätigung. Versionskennungen sind nicht Teil öffentlicher Terminantworten. Auch der Importpfad erhöht die Version bei Änderungen. Die vorhandenen Ersteller-/Berechtigungs-/Vorschlagsregeln bleiben erhalten.

## Zusätzliche Bedienverbesserungen

- Programmübersicht vor dem Speichern/Vorschlagen; Zeitraumwechsel ersetzt ein bearbeitetes Programm erst nach ausdrücklicher Rückfrage, auch ohne JavaScript.
- Ortsvorschläge ohne technische Kennung, sofern Ort und Landkreis eindeutig sind. Mehrdeutige Namen bleiben unterscheidbar.
- Warnung vor Verlassen bearbeiteter Formulare.
- Kurzlebige Entwurfsicherung für Einzel- und Sammelbearbeitung öffentlicher Terminfelder, nur im aktuellen Tab (`sessionStorage`, maximal 20 Minuten). Keine Sitzungs-/Einladungs-/CSRF-Tokens und keine Vorschlagskontaktfelder. Nach erfolgreichem Speichern, Verwerfen oder Abmelden wird gelöscht. Wiederherstellung ist ausdrücklich zu wählen, löst kein automatisches Speichern aus und behält die alte Versionskennung bei.
- Nach Sitzungsablauf Rückkehr zur eigenen Redaktionsseite. Fremde URLs und Pfade außerhalb der Redaktion werden nicht als Rückkehrziel akzeptiert.
- Freiwillige interne Bezeichnung offener Einladungen, maximal 120 Zeichen; keine zusätzliche E-Mail-Erfassung.
- Eigene Hilfeseite für Kalenderabos mit kopierbarer Adresse und Verweisen auf die Anleitungen von Apple, Google und Microsoft. Einmalimport und Abo werden unterschieden.

## Migrationen und Datenerhalt

015 ergänzt ausschließlich eine Einladungsbezeichnung mit leerem Default, 016 eine Terminversion mit Default 1. Keine vorhandenen Inhalts-, Rollen-, Passkey-, Sitzungs- oder Einladungswerte werden durch die Migrationen geändert. Keine Produktivdaten wurden zur Prüfung verwendet.

Upgrade-Test gegen `origin/main` im eigenen PostgreSQL-Stack: **16 Bestandszeilen in 14 Tabellen unverändert**. Der Versionsschutz kann sehr alte, noch geöffnete Formulare ohne Kennung zurückweisen; neu öffnen ist erforderlich. Es wird dadurch nichts überschrieben.

## Prüfung

- Lint einschließlich Migrations- und Schichtenregeln, Typprüfung, Web-/API-Build und Produktions-Dockerbuild bestanden.
- 425 Tests bestanden. Coverage gegenüber main: Lines **99,94 → 99,94 %**, Statements **99,63 → 99,69 %**, Functions **100 → 100 %**, Branches **97,03 → 97,41 %**.
- Eigener Produktionsnachbau mit `kirmes_test`, Mailpit und eigenen Ports/Volumes. HTTP-Assistent ohne JavaScript: drei Schritte, Vorschlag zunächst unsichtbar, Redaktion übernimmt, zwei Termine sichtbar, Rückfragedaten gelöscht.
- Browser: 54 Ansichten bei 320/375/768/980/1024/1280px ohne Seitenüberlauf; geöffnete Mitglieder-Rückfrage auf Handy und Tablet; gefüllte Formulare und Rollenprüfung. Helle Palette über einen nur lesenden lokalen Prüfproxy mit unveränderten Light-Variablen geprüft.
- Sitzungsablauf im Nachbau tatsächlich ausgelöst: POST zur Anmeldung umgeleitet; Testsitzung anschließend im Nachbau erneuert; Eingaben über Entwurf übernommen und ausdrücklich gespeichert; danach kein Entwurfhinweis mehr. Keine neue Browser-Passkeyregistrierung ausgeführt.
- Kalender-Abo-Hilfeseite und Adresse geprüft; kein Abo in einem persönlichen Kalender angelegt.

## Betriebliche Grenzen

Ein echtes aktuelles Serverbackup wurde hier nicht wiederhergestellt; dafür fehlt der Serverzugang. Ein Reservepasskey muss am persönlichen Gerät eingerichtet/geprüft werden. Das ist keine Leistung, die eine grüne Pipeline ersetzt. Siehe auch Betriebs-Issue #45.

Die Kontolöschung bleibt eine bewusste, bestätigte Entfernung. Eine zusätzliche Sperr-/Archivfunktion mit längerer Namensaufbewahrung wurde nicht eingeführt; sie braucht eine eigene Festlegung zur Aufbewahrung. Aktuell entfällt die Namenszuordnung nach Kontolöschung weiterhin wie dokumentiert.

Veröffentlichen erst nach Betreiberfreigabe für den PR; `main` wurde während dieser Umsetzung nicht verändert.
