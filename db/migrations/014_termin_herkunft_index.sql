-- Interne Erstelleranzeige: Original-Anlage im Protokoll effizient finden, keine Daten ändern.
CREATE INDEX aenderungsprotokoll_termin_anlage_idx
  ON aenderungsprotokoll ((details->>'id'), id)
  WHERE aktion = 'termin_angelegt';
