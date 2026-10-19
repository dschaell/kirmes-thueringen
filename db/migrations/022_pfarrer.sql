-- Pfarrer/in beim Gottesdienst (Issue #175). Nur ergänzend: neue, leere Spalten.
ALTER TABLE termin ADD COLUMN pfarrer text CHECK (char_length(pfarrer) <= 120);
ALTER TABLE vorschlag_termin ADD COLUMN pfarrer text CHECK (char_length(pfarrer) <= 120);
