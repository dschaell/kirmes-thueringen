-- Endzeit auch in Vorschlägen (Issue #288), wird bei der Übernahme mitgenommen. NULL = keine.
-- Nur ergänzend: neue, leere Spalte – Daten bleiben unverändert.
ALTER TABLE vorschlag_termin ADD COLUMN ende time;
