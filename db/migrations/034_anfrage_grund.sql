-- Grund einer abgelehnten Mitmach-Anfrage (Issue #284) – ging per Mail an die Person. Nur
-- ergänzend: neue, leere Spalte; wird mit der Anfrage nach 90 Tagen gelöscht.
ALTER TABLE mitmach_anfrage ADD COLUMN grund text CHECK (char_length(grund) <= 1000);
