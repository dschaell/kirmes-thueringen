-- Neue Kennung für atomare Schreibkonfliktprüfung; vorhandene Termininhalte bleiben unverändert.
ALTER TABLE termin ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);
