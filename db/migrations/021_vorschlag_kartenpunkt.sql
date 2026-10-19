-- Kartenpunkt zu einer vorgeschlagenen Veranstaltung (Issue #169). Nur ergänzend: zwei neue,
-- leere Spalten. Gespeichert werden nur Zahlen – nie der eingereichte Link.
ALTER TABLE vorschlag_termin
  ADD COLUMN platz_lat double precision CHECK (platz_lat BETWEEN 47 AND 56),
  ADD COLUMN platz_lon double precision CHECK (platz_lon BETWEEN 5 AND 16),
  ADD CONSTRAINT vorschlag_termin_platz_paar CHECK ((platz_lat IS NULL) = (platz_lon IS NULL));
