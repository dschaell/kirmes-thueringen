-- Rolle „Kirmesgesellschaft“ (Issue #180): Konto und Einladung gehören zu genau einem Ort.
-- Nur ergänzend: erlaubte Rollen erweitert, neue leere Spalte ort_id; bestehende Konten unverändert.
ALTER TABLE admin DROP CONSTRAINT admin_rolle_check;
ALTER TABLE admin
  ADD CONSTRAINT admin_rolle_check CHECK (rolle IN ('admin', 'redaktion', 'kirmesgesellschaft')),
  ADD COLUMN ort_id bigint REFERENCES ort (id),
  ADD CONSTRAINT admin_kg_ort CHECK ((rolle = 'kirmesgesellschaft') = (ort_id IS NOT NULL));

ALTER TABLE einladung DROP CONSTRAINT einladung_rolle_check;
ALTER TABLE einladung
  ADD CONSTRAINT einladung_rolle_check CHECK (rolle IN ('admin', 'redaktion', 'kirmesgesellschaft')),
  ADD COLUMN ort_id bigint REFERENCES ort (id) ON DELETE CASCADE,
  ADD CONSTRAINT einladung_kg_ort CHECK ((rolle = 'kirmesgesellschaft') = (ort_id IS NOT NULL));
