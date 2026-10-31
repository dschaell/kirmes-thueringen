-- Push-Benachrichtigungen (Issue #348): je Gerät Push-Endpunkt und Schlüssel, gefolgte Orte und
-- gemerkte Termine. Keine Namen, keine Mail-Adressen. Nur ergänzend: neue Tabellen.
CREATE TABLE push_abo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh        text NOT NULL CHECK (char_length(p256dh) <= 200),
  auth          text NOT NULL CHECK (char_length(auth) <= 100),
  erinnerung    boolean NOT NULL DEFAULT true,
  erinnert_fuer date,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  gesehen_am    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE push_ort (
  abo_id uuid NOT NULL REFERENCES push_abo (id) ON DELETE CASCADE,
  ort_id bigint NOT NULL REFERENCES ort (id) ON DELETE CASCADE,
  PRIMARY KEY (abo_id, ort_id)
);
CREATE INDEX push_ort_ort ON push_ort (ort_id);
CREATE TABLE push_termin (
  abo_id    uuid NOT NULL REFERENCES push_abo (id) ON DELETE CASCADE,
  termin_id uuid NOT NULL REFERENCES termin (id) ON DELETE CASCADE,
  PRIMARY KEY (abo_id, termin_id)
);
CREATE INDEX push_termin_termin ON push_termin (termin_id);
