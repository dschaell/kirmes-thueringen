-- Eigener Name der Kirmesgesellschaft je Ort (Issue #246), z. B. „Traditionsverein „Dorffreunde“
-- Riechheim e.V.“. Nur ergänzend: neue, leere Spalte – vorhandene Daten bleiben unverändert.
-- Leer = Anzeige „Kirmesgesellschaft <Ort>“.
ALTER TABLE ort ADD COLUMN kg_name text
  CHECK (kg_name IS NULL OR char_length(kg_name) BETWEEN 1 AND 200);
