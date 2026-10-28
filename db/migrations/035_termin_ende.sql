-- Optionale Endzeit je Termin (Issue #286), z. B. Kartenvorverkauf 10–12 Uhr. NULL = keine Endzeit.
-- Ende vor Beginn = nach Mitternacht. Nur ergänzend: neue, leere Spalte – Daten bleiben unverändert.
ALTER TABLE termin ADD COLUMN ende time;
