-- Band (eigenes Feld, durchsuchbar) und öffentliche Hinweise je Termin (Eintritt, Einlass, Shuttle …)
ALTER TABLE termin ADD COLUMN band text CHECK (char_length(band) BETWEEN 1 AND 120);
ALTER TABLE termin ADD COLUMN info text CHECK (char_length(info) BETWEEN 1 AND 500);
