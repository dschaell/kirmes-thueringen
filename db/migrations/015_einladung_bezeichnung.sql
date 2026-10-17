-- Interne Zuordnung offener Einladungen; bestehende Einladungen und Zugänge bleiben unverändert.
ALTER TABLE einladung ADD COLUMN bezeichnung text NOT NULL DEFAULT '' CHECK (length(bezeichnung) <= 120);
