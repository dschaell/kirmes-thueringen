-- Veranstalter und Eintritt je Termin (Issue #278) – für Terminseite und Google (schema.org
-- organizer/offers). Nur ergänzend: neue, leere Spalten – vorhandene Daten bleiben unverändert.
ALTER TABLE termin ADD COLUMN veranstalter text
  CHECK (veranstalter IS NULL OR char_length(veranstalter) BETWEEN 1 AND 200);
-- Cent, 0 = Eintritt frei, NULL = unbekannt
ALTER TABLE termin ADD COLUMN eintritt_cent integer
  CHECK (eintritt_cent IS NULL OR eintritt_cent BETWEEN 0 AND 100000);
