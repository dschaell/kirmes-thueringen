-- Vereinsprofil je Ort (Issue #310): kurzer Text zur Kirmes, Links und öffentlicher Kontakt der
-- Kirmesgesellschaft. Nur ergänzend: neue, leere Spalten – vorhandene Daten bleiben unverändert.
ALTER TABLE ort ADD COLUMN kg_text text CHECK (char_length(kg_text) <= 800);
ALTER TABLE ort ADD COLUMN kg_website text CHECK (char_length(kg_website) <= 300);
ALTER TABLE ort ADD COLUMN kg_instagram text CHECK (char_length(kg_instagram) <= 300);
ALTER TABLE ort ADD COLUMN kg_facebook text CHECK (char_length(kg_facebook) <= 300);
ALTER TABLE ort ADD COLUMN kg_kontakt text CHECK (char_length(kg_kontakt) <= 200);
