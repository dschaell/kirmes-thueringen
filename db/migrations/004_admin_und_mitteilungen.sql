-- Redaktionszugang (Admin) mit Passwort + Einmalcode, Sitzungen, Mitteilungen, eigene Orte.

CREATE TABLE admin (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email           text NOT NULL UNIQUE CHECK (email ~ '^[^@\s]+@[^@\s]+$'),
  -- scrypt: "scrypt$N$r$p$salz$hash" (Base64)
  passwort_hash   text NOT NULL,
  -- TOTP-Geheimnis (Base32), RFC 6238
  totp_geheimnis  text NOT NULL,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  letzter_login   timestamptz
);

CREATE TABLE admin_sitzung (
  -- SHA-256 des Sitzungs-Tokens; das Token selbst steht nur im HttpOnly-Cookie
  token_hash   bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  admin_id     bigint NOT NULL REFERENCES admin (id) ON DELETE CASCADE,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  laeuft_ab    timestamptz NOT NULL
);
CREATE INDEX admin_sitzung_ablauf_idx ON admin_sitzung (laeuft_ab);

CREATE TABLE mitteilung (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titel         text NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 120),
  text          text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  link          text CHECK (link ~ '^(https://|/)'),
  veroeffentlicht_am timestamptz,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  erstellt_von  bigint REFERENCES admin (id) ON DELETE SET NULL
);
CREATE INDEX mitteilung_veroeffentlicht_idx ON mitteilung (veroeffentlicht_am DESC) WHERE veroeffentlicht_am IS NOT NULL;

-- Herkunft eines Ortes: 'osm' (Ortsverzeichnis) oder 'redaktion' (von Hand angelegt)
ALTER TABLE ort ADD COLUMN herkunft text NOT NULL DEFAULT 'osm' CHECK (herkunft IN ('osm', 'redaktion'));

-- Protokoll: auch Admin-Änderungen nachvollziehbar
ALTER TABLE aenderungsprotokoll ADD COLUMN admin_id bigint REFERENCES admin (id) ON DELETE SET NULL;
ALTER TABLE termin ADD COLUMN eingetragen_von_admin bigint REFERENCES admin (id) ON DELETE SET NULL;
