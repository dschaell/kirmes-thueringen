-- datenaenderung-freigegeben: #223
-- Kirmestanz als eigene Art (Issue #223, Entscheidung des Betreibers): Die erlaubten Werte bekommen
-- 'tanz' dazu. Gezielte, einmalige Umstellung: NUR Termine und Vorschläge mit der Art 'party' UND
-- „tanz“ im Titel (gleiche Erkennung wie im Core; Kindertanz ist längst 'familie') werden 'tanz'.
-- Geänderte Termine bekommen eine neue Version (Kalender-Abos). Alle anderen Daten bleiben.
ALTER TABLE termin DROP CONSTRAINT termin_kategorie_check;
ALTER TABLE termin ADD CONSTRAINT termin_kategorie_check
  CHECK (kategorie IN ('tanz', 'party', 'familie', 'tradition', 'fruehschoppen', 'staendchen', 'sonstiges'));

ALTER TABLE vorschlag_termin DROP CONSTRAINT vorschlag_termin_kategorie_check;
ALTER TABLE vorschlag_termin ADD CONSTRAINT vorschlag_termin_kategorie_check
  CHECK (kategorie IN ('tanz', 'party', 'familie', 'tradition', 'fruehschoppen', 'staendchen', 'sonstiges'));

UPDATE termin SET kategorie = 'tanz', version = version + 1, geaendert_am = now()
  WHERE kategorie = 'party' AND titel ~* 'tanz';
UPDATE vorschlag_termin SET kategorie = 'tanz'
  WHERE kategorie = 'party' AND titel ~* 'tanz';
