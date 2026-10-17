# Nutzbarkeit, interne Herkunft und Redaktionseinladungen

## Änderungen

- Admin und Redaktion sehen in Terminliste, Einzelbearbeitung, Ortsübersicht und Sammelbearbeitung „Angelegt von“ mit Zeitpunkt. Bei Besuchervorschlägen heißt es passend „Übernommen von“; Bearbeitungslinks zeigen die Bezeichnung der Kirmesgesellschaft.
- Grundlage ist ausschließlich die Anlage-Protokollzeile aus derselben Transaktion wie die ursprüngliche Erstellung. Ein späteres Upsert darf nicht fälschlich zum Ersteller werden. Fehlende historische Nachweise werden als „Nicht dokumentiert“ angezeigt. Bei entfernten Konten ist eine alte Zuordnung gegebenenfalls nicht mehr möglich; es werden keine Namen geraten oder Kundendaten nachträglich geändert.
- Die Herkunft ist bewusst kein Bestandteil des öffentlichen Terminmodells oder öffentlichen DTOs. Eine separate geschützte API nimmt höchstens 100 eindeutige UUIDs an. Nur Sitzungen von Admin und Redaktion erhalten Daten, mit Cache-Control: no-store. Ein additiver Index beschleunigt die Protokollsuche; keine Bestandsdatenmigration.
- Admins finden „Redaktion & Einladungen“ direkt in der Navigation und „Redaktion einladen“ auf der Übersicht. Ein erzeugter Link lässt sich kopieren, über das Teilen-Menü des Geräts, E-Mail oder WhatsApp weitergeben. Empfängerwahl und Versand erfolgen durch den Admin. Kein automatischer Nachrichtenversand und keine Adressspeicherung.
- Vorhandene Einladungsregeln bleiben bestehen: standardmäßig Redaktion, optional Admin, sieben Tage gültig, einmalige Registrierung per Passkey, widerrufbar. Der reine Linkaufruf verbraucht die Einladung nicht. Ohne Teilen-Unterstützung bleiben Kopieren und E-Mail verfügbar; ohne JavaScript bleibt der Link manuell kopierbar.
- Die Empfängeransicht erklärt den intern sichtbaren Namen sowie die tatsächlich gespeicherten Kontodaten. Das Namensfeld hat einen kurzen zugänglichen Namen und einen getrennten Hilfetext.
- Auf kleinen Bildschirmen sind sämtliche Hauptnavigationsziele sichtbar statt in einer Leiste ohne sichtbaren Scrollhinweis versteckt. „1 Termin“ wird grammatisch korrekt angezeigt. In der gefüllten Ortsverwaltung stehen die drei Eingabemodi auf kleinen Bildschirmen untereinander; der zuvor reproduzierte Überlauf von 38–93 Pixeln ist behoben.

## Prüfungen

Automatisiert: Erst-Ersteller bleibt nach Ändern, Bestätigen und Upsert erhalten; Bearbeitungslink, Vorschlag und Altimport werden unterschieden; anonyme und falsche Sitzungen dürfen die Herkunft nicht lesen; gültige Admin-/Redaktionssitzungen dürfen lesen; ungültige und doppelte IDs werden abgewiesen; öffentliche Terminliste und Einzelansicht enthalten keine Herkunftsmetadaten. Bestehende Tests prüfen Einladungserzeugung, Annahme per Software-Passkey, Verbrauch, Widerruf und Admin-Rollenbegrenzung.

409 Tests erfolgreich. Der vollständige parallele Lauf wurde nach der unten beschriebenen Isolationskorrektur wiederholt. Lint, Typprüfung und Produktionsbuild erfolgreich. Coverage ohne Rückgang: Zeilen 99,94 %, Statements 99,63 %, Funktionen 100 %, Zweige 97,03 % (vorher 97,01 %).

Browserprüfung ausschließlich im eigenen Nachbau mit kirmes_test, eigenen Testkonten, einem Testtermin und einer Testeinladung. Kopieren funktionierte. E-Mail-/WhatsApp-Ziele wurden auf korrekten Inhalt geprüft, ohne eine Nachricht zu versenden. Das native Teilen-Menü wurde nicht bis zu einem tatsächlichen Versand getestet. Fünf gefüllte Adminansichten wurden bei 320/375/1280 Pixeln geprüft: kein Seitenüberlauf, alle Hauptnavigationsziele sichtbar. Die Redaktion sieht den ursprünglichen Ersteller, erhält aber keinen Zugang zur Mitgliederverwaltung; die öffentliche Terminansicht enthält weder Erstellername noch Herkunftszeile. Eine ungültig gewordene Testeinladung zeigt die verständliche Aufforderung, bei der einladenden Person einen neuen Link anzufragen. Die Empfängeransicht wurde ohne Kontoanlage geöffnet; die Registrierung selbst wird durch die vorhandenen API-/Passkeytests abgedeckt.

## Zusätzlich gefundener Pipelinefehler (Issue #82)

Ein älterer PostgreSQL-Test löschte alle Testorte mit Präfix it- und damit potenziell Daten paralleler Vorschlagstests. Ein kompletter Lauf reproduzierte einen FK-Fehler beim Aufräumen. Die Bereinigung betrifft jetzt nur die eigenen Orte it-muehlberg und it-ulla; fremde Protokollzeilen werden nicht mehr pauschal gelöscht. Danach bestanden die parallelen Gesamtläufe wiederholt.

Keine Live-Konten oder Live-Termine verändert. Kein Versand an Dritte. Veröffentlichung erst nach Betreiberfreigabe. Die Formular-Gestaltung aus PR #80 und die Werkzeugupdates aus PR #78 sind getrennte, noch nicht veröffentlichte Änderungen.
