-- datenaenderung-freigegeben: #434
-- Karibische Kirmes Klettbach-Schellroda 2026 (Issue #434): Recherche aus Flyern und Facebook, nicht bestätigt.
-- Nur neue Zeilen (ON CONFLICT DO NOTHING); nichts Vorhandenes wird verändert.
INSERT INTO termin (ort_id, datum, beginn, titel, kategorie, veranstaltungsort, band, info, quelle, muttizettel, bestaetigt)
SELECT o.id, v.datum, v.beginn, v.titel, v.kategorie, v.veranstaltungsort, v.band, v.info, v.quelle, v.muttizettel, false
  FROM (VALUES
  ('klettbach', DATE '2026-08-20', TIME '18:00:00', 'Ladies Night', 'party', NULL, 'Peakfein Events', 'Stripper, Sektempfang, Fingerfood, Strand & Cocktails, Special Act. VVK 20 €, Abendkasse 22 €. Eintritt ab 18 Jahren. Vorverkauf über vier Stellen (siehe Flyer).', 'Flyer Karibische Kirmes Klettbach (Instagram)', false),
  ('schellroda', DATE '2026-08-21', TIME '16:00:00', 'Kirmesgottesdienst', 'tradition', 'Kirche Schellroda', NULL, NULL, 'Facebook-Post Kirmesgesellschaft Klettbach-Schellroda', false),
  ('schellroda', DATE '2026-08-21', TIME '17:00:00', 'Kirmesständchen', 'staendchen', NULL, NULL, NULL, 'Facebook-Post Kirmesgesellschaft Klettbach-Schellroda', false),
  ('klettbach', DATE '2026-08-21', TIME '19:00:00', 'Beach Party', 'party', 'Klettbacher Beach', 'Kim Noble, HouseJunkee, Peakfein Events', 'Einlass ab 19 Uhr, ab 16 Jahren. Eröffnungsrede 20:30 Uhr. Happy Hour 21–22 Uhr.', 'Flyer und Facebook-Post Karibische Kirmes', true),
  ('klettbach', DATE '2026-08-22', TIME '08:00:00', 'Kirmesständchen', 'staendchen', NULL, NULL, 'Ständchen durch Klettbach bis 18 Uhr.', 'Flyer und Facebook-Post Karibische Kirmes', false),
  ('klettbach', DATE '2026-08-22', TIME '18:00:00', 'Partynight', 'party', 'Klettbacher Beach', NULL, 'Einlass ab 18 Uhr, ab 16 Jahren. Happy Hour 20–21 Uhr.', 'Flyer und Facebook-Post Karibische Kirmes', true),
  ('klettbach', DATE '2026-08-22', TIME '20:00:00', 'Kirmestanz', 'tanz', 'Klettbacher Beach', 'SURFACES (Party- & Rock-Coverband)', 'Programm der Kirmesgesellschaft ab 19 Uhr. Ab 16 Jahren.', 'Flyer und Facebook-Post Karibische Kirmes', true)
  ) AS v(slug, datum, beginn, titel, kategorie, veranstaltungsort, band, info, quelle, muttizettel)
  JOIN ort o ON o.slug = v.slug
ON CONFLICT (ort_id, datum, titel) DO NOTHING;

-- Festplatz Schellroda: Kirche (Google Maps Treffer „Kirche St. Georg“, 50.9165144 / 11.1150995, Zuordnung bitte prüfen)
INSERT INTO festplatz (ort_id, name, lage)
SELECT o.id, 'Kirche Schellroda', ST_SetSRID(ST_MakePoint(11.1150995, 50.9165144), 4326)::geography
  FROM ort o WHERE o.slug = 'schellroda'
ON CONFLICT (ort_id, name) DO NOTHING;
