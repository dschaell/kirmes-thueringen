-- Beiträge mit Fotos (Issue #352): Kirmesgesellschaft und Redaktion schreiben kurze Beiträge zu
-- ihrem Ort, optional mit bis zu sechs Fotos. Nur ergänzend: neue Tabellen. Fotos sind neu kodierte
-- WebP-Bilder in zwei Größen (ohne Metadaten), nie das Original. Gelöscht wird nur von Hand durch
-- Kirmesgesellschaft oder Redaktion – kein Ablaufdatum. Ein gelöschter Termin löst nur die Verknüpfung.
CREATE TABLE beitrag (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ort_id            bigint NOT NULL REFERENCES ort (id) ON DELETE RESTRICT,
  termin_id         uuid REFERENCES termin (id) ON DELETE SET NULL,
  text              text NOT NULL CHECK (char_length(text) <= 1000),
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  -- null = Entwurf, Fotos werden noch hochgeladen; erst dann öffentlich
  veroeffentlicht_am timestamptz,
  erstellt_von      bigint REFERENCES admin (id) ON DELETE SET NULL
);
CREATE INDEX beitrag_ort ON beitrag (ort_id, veroeffentlicht_am DESC);
CREATE INDEX beitrag_neueste ON beitrag (veroeffentlicht_am DESC) WHERE veroeffentlicht_am IS NOT NULL;

CREATE TABLE beitrag_foto (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beitrag_id uuid NOT NULL REFERENCES beitrag (id) ON DELETE CASCADE,
  nr         smallint NOT NULL CHECK (nr BETWEEN 1 AND 6),
  gross      bytea NOT NULL CHECK (octet_length(gross) <= 2000000),
  klein      bytea NOT NULL CHECK (octet_length(klein) <= 500000),
  breite     integer NOT NULL CHECK (breite BETWEEN 1 AND 4000),
  hoehe      integer NOT NULL CHECK (hoehe BETWEEN 1 AND 4000),
  alt        text NOT NULL CHECK (char_length(alt) <= 200),
  UNIQUE (beitrag_id, nr)
);
