-- datenaenderung-freigegeben: #238
-- Zwei Korrekturen (Issue #238, Entscheidung des Betreibers), gezielt über die Termin-IDs; gibt es
-- sie nicht (andere Datenbank), passiert nichts. Neue Version für Kalender-Abos. Sonst keine Änderung.
-- Kinderkirmes Elleben: kein „U18 nur mit Muttizettel“
UPDATE termin SET muttizettel = false, version = version + 1, geaendert_am = now()
 WHERE id = 'b8467104-c99e-4e9d-ad82-288d1da68ba5' AND muttizettel;
-- Tannensetzen mit Kanonenschießen (Schmira): Brauchtum → Sonstiges
UPDATE termin SET kategorie = 'sonstiges', version = version + 1, geaendert_am = now()
 WHERE id = 'cd8a5eea-5ac6-45b7-9894-b6b4409fa4fa' AND kategorie <> 'sonstiges';
