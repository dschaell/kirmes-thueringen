-- Plakat je Termin (Issue #297). Nur ergänzend: neue Tabelle. Gespeichert werden nur neu kodierte
-- WebP-Bilder in zwei Größen (ohne Metadaten), nie das hochgeladene Original. Mit dem Termin weg.
CREATE TABLE termin_plakat (
  termin_id uuid PRIMARY KEY REFERENCES termin(id) ON DELETE CASCADE,
  gross bytea NOT NULL CHECK (octet_length(gross) <= 2000000),
  klein bytea NOT NULL CHECK (octet_length(klein) <= 500000),
  breite integer NOT NULL CHECK (breite BETWEEN 1 AND 4000),
  hoehe integer NOT NULL CHECK (hoehe BETWEEN 1 AND 4000),
  hochgeladen_am timestamptz NOT NULL DEFAULT now(),
  hochgeladen_von bigint REFERENCES admin(id) ON DELETE SET NULL
);
