-- Art „Sonstiges“ für Termine ohne passende Kategorie, z. B. Seniorennachmittag (Issue #147).
-- Nur erweiternd: Die erlaubten Werte bekommen 'sonstiges' dazu. Vorhandene Termine und Vorschläge
-- bleiben unverändert (keine Datenänderung).
ALTER TABLE termin DROP CONSTRAINT termin_kategorie_check;
ALTER TABLE termin ADD CONSTRAINT termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'staendchen', 'sonstiges'));

ALTER TABLE vorschlag_termin DROP CONSTRAINT vorschlag_termin_kategorie_check;
ALTER TABLE vorschlag_termin ADD CONSTRAINT vorschlag_termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition', 'staendchen', 'sonstiges'));
