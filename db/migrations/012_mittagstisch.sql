-- Mittagstisch am Termin (Issue #66): Gerichte mit Preis, z. B. beim Frühschoppen.
-- Rein ergänzend – vorhandene Termine bleiben unverändert.
CREATE TABLE termin_speise (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  termin_id  uuid NOT NULL REFERENCES termin (id) ON DELETE CASCADE,
  position   smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Preis in Cent; NULL = ohne Preisangabe
  preis_cent integer CHECK (preis_cent BETWEEN 0 AND 100000),
  UNIQUE (termin_id, position)
);
