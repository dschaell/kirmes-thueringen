-- Korrekturhinweise zu einem veröffentlichten Termin (Issue #107). Rein ergänzend, ohne IP.
-- Kontaktangaben werden beim Erledigen gelöscht, der ganze Hinweis nach 30/180 Tagen.
CREATE TABLE korrektur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termin_id uuid NOT NULL REFERENCES termin(id) ON DELETE CASCADE,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  kontakt_name text CHECK (char_length(kontakt_name) <= 120),
  kontakt_email text CHECK (char_length(kontakt_email) <= 200),
  erledigt_am timestamptz,
  erledigt_von bigint REFERENCES admin(id) ON DELETE SET NULL
);
CREATE INDEX korrektur_offen_idx ON korrektur(erstellt_am) WHERE erledigt_am IS NULL;
CREATE INDEX korrektur_termin_idx ON korrektur(termin_id);
