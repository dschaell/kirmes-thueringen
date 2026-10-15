-- Herkunft jedes Termins (Nachweis der eigenen Recherche): Link zum Post, „Telefonat KG“, „Aushang“ …
-- Wird nicht öffentlich angezeigt.
ALTER TABLE termin ADD COLUMN quelle text CHECK (char_length(quelle) <= 500);

-- Wer hat den Termin eingetragen? NULL = Redaktion (Import), sonst Bearbeitungslink der Kirmesgesellschaft
ALTER TABLE termin ADD COLUMN eingetragen_durch bigint REFERENCES bearbeitungslink (id) ON DELETE SET NULL;
