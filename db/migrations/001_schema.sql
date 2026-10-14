-- Grundschema: Landkreise, Orte (mit Geodaten), Veranstalter, Termine.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE landkreis (
  kuerzel text PRIMARY KEY CHECK (char_length(kuerzel) BETWEEN 1 AND 4),
  name    text NOT NULL UNIQUE
);

CREATE TABLE ort (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug      text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name      text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  landkreis text NOT NULL REFERENCES landkreis (kuerzel),
  lage      geography(Point, 4326)
);
CREATE INDEX ort_landkreis_idx ON ort (landkreis);
CREATE INDEX ort_lage_idx ON ort USING gist (lage);

CREATE TABLE veranstalter (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  kontakt_email text,
  ort_id        bigint REFERENCES ort (id) ON DELETE SET NULL,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE termin (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ort_id            bigint NOT NULL REFERENCES ort (id) ON DELETE CASCADE,
  veranstalter_id   bigint REFERENCES veranstalter (id) ON DELETE SET NULL,
  datum             date NOT NULL,
  beginn            time,
  titel             text NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 200),
  veranstaltungsort text,
  kategorie         text NOT NULL CHECK (kategorie IN
                      ('kirmes','kinder','tanz','party','brauchtum','ostern','mai','fruehschoppen')),
  bestaetigt        boolean NOT NULL DEFAULT false,
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  geaendert_am      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ort_id, datum, titel)
);
CREATE INDEX termin_datum_idx ON termin (datum);
CREATE INDEX termin_ort_datum_idx ON termin (ort_id, datum);
