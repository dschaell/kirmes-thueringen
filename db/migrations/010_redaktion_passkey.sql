-- Redaktion meldet sich nur noch mit Passkey an (Issue #56). Gespeichert werden ein selbst
-- gewählter Anzeigename, die Rolle und – in admin_passkey – der öffentliche Schlüssel.
-- Keine E-Mail-Adresse, kein Passwort, kein TOTP-Geheimnis mehr.

-- Konten ohne Passkey könnten sich danach nicht mehr anmelden – sie werden entfernt
-- (Sitzungen per CASCADE; Verweise in Termin/Protokoll/Mitteilung werden NULL).
-- Der erste Zugang lässt sich danach über /admin/einrichten neu anlegen.
DELETE FROM admin a WHERE NOT EXISTS (SELECT 1 FROM admin_passkey p WHERE p.admin_id = a.id);

ALTER TABLE admin
  ADD COLUMN name   text,
  ADD COLUMN rolle  text NOT NULL DEFAULT 'admin',
  -- Zufällige, stabile Kennung für WebAuthn (user.id) – verrät nichts über die Person
  ADD COLUMN handle uuid NOT NULL DEFAULT gen_random_uuid();
UPDATE admin SET name = 'Admin' WHERE name IS NULL;
ALTER TABLE admin
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN rolle DROP DEFAULT,
  ADD CONSTRAINT admin_name_check CHECK (char_length(name) BETWEEN 1 AND 60),
  ADD CONSTRAINT admin_rolle_check CHECK (rolle IN ('admin', 'redaktion')),
  ADD CONSTRAINT admin_handle_key UNIQUE (handle),
  DROP COLUMN email,
  DROP COLUMN passwort_hash,
  DROP COLUMN totp_geheimnis;

-- Einladungen in die Redaktion: einmalig, befristet; gespeichert wird nur der Hash des Tokens
CREATE TABLE einladung (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash   bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  rolle        text NOT NULL CHECK (rolle IN ('admin', 'redaktion')),
  erstellt_von bigint REFERENCES admin (id) ON DELETE SET NULL,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  laeuft_ab    timestamptz NOT NULL,
  genutzt_am   timestamptz,
  genutzt_von  bigint REFERENCES admin (id) ON DELETE SET NULL
);
CREATE INDEX einladung_offen_idx ON einladung (laeuft_ab) WHERE genutzt_am IS NULL;
