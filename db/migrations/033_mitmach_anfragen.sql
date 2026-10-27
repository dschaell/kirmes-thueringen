-- Mitmach-Anfragen (Issue #279): Anfragen von /redaktion-mitmachen, im Admin annehmen/ablehnen.
-- Nur ergänzend: neue Tabelle. Die E-Mail wird beim Erledigen gelöscht, die ganze Anfrage nach
-- 90 Tagen (erledigt) bzw. 180 Tagen (unbeantwortet).
CREATE TABLE mitmach_anfrage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eingegangen_am timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text CHECK (char_length(email) <= 200),
  ort text CHECK (char_length(ort) <= 120),
  info text CHECK (char_length(info) <= 2000),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'angenommen', 'abgelehnt')),
  erledigt_am timestamptz,
  erledigt_von bigint REFERENCES admin(id) ON DELETE SET NULL
);
CREATE INDEX mitmach_anfrage_offen_idx ON mitmach_anfrage(eingegangen_am) WHERE status = 'offen';
