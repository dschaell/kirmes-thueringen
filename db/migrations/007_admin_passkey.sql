-- Passkeys (WebAuthn) der Redaktion. Gespeichert wird nur der öffentliche Schlüssel.
CREATE TABLE admin_passkey (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id         bigint NOT NULL REFERENCES admin (id) ON DELETE CASCADE,
  -- Credential-ID (Base64URL), vom Authenticator vergeben
  credential_id    text NOT NULL UNIQUE CHECK (credential_id ~ '^[A-Za-z0-9_-]+$' AND char_length(credential_id) BETWEEN 16 AND 1400),
  public_key       bytea NOT NULL,
  -- Signaturzähler gegen geklonte Authenticatoren
  zaehler          bigint NOT NULL DEFAULT 0 CHECK (zaehler >= 0),
  transports       text[] NOT NULL DEFAULT '{}',
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  erstellt_am      timestamptz NOT NULL DEFAULT now(),
  zuletzt_genutzt  timestamptz
);
CREATE INDEX admin_passkey_admin_idx ON admin_passkey (admin_id);
