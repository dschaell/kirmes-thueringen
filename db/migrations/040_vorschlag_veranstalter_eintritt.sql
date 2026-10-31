-- Veranstalter und Eintritt auch in Vorschlägen und im Kirmes-Assistenten (Issue #353), werden bei
-- der Übernahme mitgenommen. NULL = keine Angabe. Nur ergänzend: neue, leere Spalten.
ALTER TABLE vorschlag_termin ADD COLUMN veranstalter text;
ALTER TABLE vorschlag_termin ADD COLUMN eintritt_cent integer;
