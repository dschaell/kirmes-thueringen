-- Freitextsuche mit Trigramm-Index (pg_trgm): ILIKE '%…%' ohne sequenziellen Scan.
-- Eine generierte Spalte bündelt die Termin-Felder, damit ein einziger Index reicht; der Ortsname
-- hat einen eigenen Index (andere Tabelle). Idempotent, läuft wie jede Migration in einer Transaktion.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE termin ADD COLUMN IF NOT EXISTS suchtext text
  GENERATED ALWAYS AS (titel || ' ' || coalesce(veranstaltungsort, '') || ' ' || coalesce(band, '')) STORED;

CREATE INDEX IF NOT EXISTS termin_suchtext_trgm_idx ON termin USING gin (suchtext gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ort_name_trgm_idx ON ort USING gin (name gin_trgm_ops);
