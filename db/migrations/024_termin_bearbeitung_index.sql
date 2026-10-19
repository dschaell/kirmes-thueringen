-- „Zuletzt bearbeitet von“ (Issue #181/#184): letzte Änderung eines Termins im Protokoll
-- effizient finden. Nur ein zusätzlicher Index, keine Datenänderung.
CREATE INDEX aenderungsprotokoll_termin_bearbeitung_idx
  ON aenderungsprotokoll ((details->>'id'), id DESC)
  WHERE aktion IN ('termin_geaendert', 'termin_bestaetigt');
