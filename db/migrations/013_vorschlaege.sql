-- Öffentliche, noch nicht veröffentlichte Vorschläge (Issue #71). Rein ergänzend, ohne IP.
CREATE TABLE vorschlag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  ort_id bigint NOT NULL REFERENCES ort(id),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'uebernommen', 'abgelehnt')),
  kontakt_name text CHECK (char_length(kontakt_name) <= 120),
  kontakt_email text CHECK (char_length(kontakt_email) <= 200),
  nachricht text CHECK (char_length(nachricht) <= 2000),
  bearbeitet_von bigint REFERENCES admin(id) ON DELETE SET NULL,
  bearbeitet_am timestamptz,
  grund text CHECK (char_length(grund) <= 500)
);
CREATE INDEX vorschlag_offen_ort_idx ON vorschlag(ort_id) WHERE status = 'offen';
CREATE INDEX vorschlag_aufraeumen_idx ON vorschlag(status, erstellt_am, bearbeitet_am);
CREATE TABLE vorschlag_termin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorschlag_id uuid NOT NULL REFERENCES vorschlag(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
  datum date NOT NULL,
  beginn time,
  titel text NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 200),
  veranstaltungsort text CHECK (char_length(veranstaltungsort) <= 120),
  kategorie text NOT NULL CHECK (kategorie IN ('party', 'familie', 'tradition')),
  band text CHECK (char_length(band) <= 120),
  info text CHECK (char_length(info) <= 500),
  muttizettel boolean NOT NULL DEFAULT false,
  speisen jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(speisen) = 'array' AND jsonb_array_length(speisen) <= 20),
  UNIQUE(vorschlag_id, position)
);
