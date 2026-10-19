-- datenaenderung-freigegeben: #154
-- Frühschoppen als eigene Art (Issue #154, Entscheidung des Betreibers): Die erlaubten Werte bekommen
-- 'fruehschoppen' dazu. Gezielte, einmalige Umstellung: NUR Termine und Vorschläge mit der Art
-- 'tradition' UND „Frühschoppen“ im Titel (gleiche Erkennung wie im Core) erhalten die neue Art.
-- Alle anderen Daten bleiben unverändert.
ALTER TABLE termin DROP CONSTRAINT termin_kategorie_check;
ALTER TABLE termin ADD CONSTRAINT termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'fruehschoppen', 'staendchen', 'sonstiges'));

ALTER TABLE vorschlag_termin DROP CONSTRAINT vorschlag_termin_kategorie_check;
ALTER TABLE vorschlag_termin ADD CONSTRAINT vorschlag_termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'fruehschoppen', 'staendchen', 'sonstiges'));

UPDATE termin SET kategorie = 'fruehschoppen'
  WHERE kategorie = 'tradition' AND titel ~* 'fr(ü|ue|u)h\s*-?\s*sc?h?oppen';
UPDATE vorschlag_termin SET kategorie = 'fruehschoppen'
  WHERE kategorie = 'tradition' AND titel ~* 'fr(ü|ue|u)h\s*-?\s*sc?h?oppen';
