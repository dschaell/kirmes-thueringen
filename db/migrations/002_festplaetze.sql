-- Festplätze (Veranstaltungsorte mit Koordinaten), gepflegt von den Kirmesgesellschaften
-- über persönliche Bearbeitungslinks. Jede Änderung wird protokolliert.

CREATE TABLE festplatz (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ort_id       bigint NOT NULL REFERENCES ort (id) ON DELETE CASCADE,
  -- Entspricht termin.veranstaltungsort (z. B. „Festzelt“); '' = Standard-Festplatz des Ortes
  name         text NOT NULL CHECK (char_length(name) <= 120),
  lage         geography(Point, 4326) NOT NULL,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ort_id, name)
);
CREATE INDEX festplatz_lage_idx ON festplatz USING gist (lage);

CREATE TABLE bearbeitungslink (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ort_id           bigint NOT NULL REFERENCES ort (id) ON DELETE CASCADE,
  -- Nur der SHA-256-Hash wird gespeichert; der Link selbst ist nach dem Erstellen nicht mehr abrufbar.
  token_hash       bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  bezeichnung      text NOT NULL CHECK (char_length(bezeichnung) BETWEEN 1 AND 200),
  erstellt_am      timestamptz NOT NULL DEFAULT now(),
  zuletzt_genutzt  timestamptz,
  gesperrt_am      timestamptz
);

CREATE TABLE aenderungsprotokoll (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zeit     timestamptz NOT NULL DEFAULT now(),
  link_id  bigint REFERENCES bearbeitungslink (id) ON DELETE SET NULL,
  ort_id   bigint REFERENCES ort (id) ON DELETE CASCADE,
  aktion   text NOT NULL,
  details  jsonb NOT NULL
);
CREATE INDEX aenderungsprotokoll_ort_idx ON aenderungsprotokoll (ort_id, zeit DESC);
