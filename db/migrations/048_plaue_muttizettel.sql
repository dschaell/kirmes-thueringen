-- datenaenderung-freigegeben: #438
-- Plaue: Muttizettel für Kirmesparty (13.11.) und Kirmestanz (14.11.), Ab-16-Regel (Issue #438).
UPDATE termin SET muttizettel = true, version = version + 1, geaendert_am = now()
 WHERE ort_id = (SELECT id FROM ort WHERE slug = 'plaue')
   AND ((titel = 'Kirmesparty' AND datum = DATE '2026-11-13') OR (titel = 'Kirmestanz' AND datum = DATE '2026-11-14'));
