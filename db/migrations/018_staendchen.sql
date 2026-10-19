-- Ständchen als eigene Art (Issue #135). Nur erweiternd: Die erlaubten Werte bekommen
-- 'staendchen' dazu. Vorhandene Termine und Vorschläge bleiben unverändert (keine Datenänderung).
ALTER TABLE termin DROP CONSTRAINT termin_kategorie_check;
ALTER TABLE termin ADD CONSTRAINT termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'staendchen'));

ALTER TABLE vorschlag_termin DROP CONSTRAINT vorschlag_termin_kategorie_check;
ALTER TABLE vorschlag_termin ADD CONSTRAINT vorschlag_termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'staendchen'));
