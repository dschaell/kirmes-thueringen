-- datenaenderung-freigegeben: #429
-- Flyer-Termine (Issue #429): Gutendorf, Plaue, Großliebringen – Recherche, nicht bestätigt.
-- Nur neue Zeilen (ON CONFLICT DO NOTHING); nichts Vorhandenes wird verändert.
INSERT INTO termin (ort_id, datum, beginn, titel, kategorie, veranstaltungsort, band, info, quelle, muttizettel, bestaetigt)
SELECT o.id, v.datum, v.beginn, v.titel, v.kategorie, v.veranstaltungsort, v.band, v.info, v.quelle, v.muttizettel, false
  FROM (VALUES
  ('grossliebringen', DATE '2026-11-06', TIME '20:00:00', 'Kirmestanz', 'tanz', 'Festzelt (beheizt)', 'Step', 'Kartenvorverkauf am 30.10.2026, 15–18 Uhr, bei EDEKA Bachmann in Stadtilm. U16 nur mit Erziehungsberechtigten + Muttizettel · Ü16 mit Muttizettel, Erziehungsbeauftragtem und Ausweiskopie des Erziehungsberechtigten · Ü18 frei.', 'Instagram-Flyer Kirmesverein Großliebringen', true),
  ('grossliebringen', DATE '2026-11-07', TIME '09:00:00', 'Kirmesständchen', 'staendchen', NULL, 'Thüringer Bergfeuer', NULL, 'Instagram-Flyer Kirmesverein Großliebringen', false),
  ('grossliebringen', DATE '2026-11-07', TIME '20:00:00', 'Kirmesdisco', 'party', 'Festzelt (beheizt)', 'Aybee', 'Kartenvorverkauf am 30.10.2026, 15–18 Uhr, bei EDEKA Bachmann in Stadtilm. U16 nur mit Erziehungsberechtigten + Muttizettel · Ü16 mit Muttizettel, Erziehungsbeauftragtem und Ausweiskopie des Erziehungsberechtigten · Ü18 frei.', 'Instagram-Flyer Kirmesverein Großliebringen', true),
  ('gutendorf', DATE '2026-10-30', TIME '21:00:00', 'Gruselige House-Kirmes', 'party', 'Festsaal', 'Ravegarten', 'Einlass ab 20 Uhr. 21 Uhr Electronic House Sets, 0 Uhr Kostüm-Contest, 0–2 Uhr 80s/90s/2000s-Classics. Kostüm erwünscht.', 'Instagram-Flyer Kirmesgesellschaft Gutendorf x Ravegarten', false),
  ('plaue', DATE '2026-11-07', NULL, 'Kirmesgottesdienst', 'tradition', 'Liebfrauenkirche', NULL, NULL, 'Instagram-Flyer @kirmesgesellschaftplaue (Zeitlicher Ablauf)', false),
  ('plaue', DATE '2026-11-08', NULL, 'Kirmesständchen', 'staendchen', 'ganzer Ort', NULL, 'Kirmesständchen durch den Ort.', 'Instagram-Flyer @kirmesgesellschaftplaue (Zeitlicher Ablauf)', false),
  ('plaue', DATE '2026-11-13', TIME '22:00:00', 'Kirmesparty', 'party', NULL, 'Funky Monkeys, DJ Magic Marv', 'Einlass ab 21 Uhr. Kartenzahlung möglich.', 'Instagram-Flyer @kirmesgesellschaftplaue', false),
  ('plaue', DATE '2026-11-14', TIME '15:00:00', 'Kinderkirmes', 'familie', NULL, NULL, 'Einlass ab 14:30 Uhr, Ende 18 Uhr. Kaffee & Kuchen, Hot Dog, Popcorn, Mystery-Boxen, Kinderschminken, Glitzertattoos. Es lädt ein der Plauesche Traditionsverein e. V.', 'Instagram-Flyer @kirmesgesellschaftplaue', false),
  ('plaue', DATE '2026-11-14', TIME '20:00:00', 'Kirmestanz', 'tanz', NULL, 'Step – Die Partymacher', 'Einlass ab 19 Uhr. Kartenzahlung möglich.', 'Instagram-Flyer @kirmesgesellschaftplaue', false)
  ) AS v(slug, datum, beginn, titel, kategorie, veranstaltungsort, band, info, quelle, muttizettel)
  JOIN ort o ON o.slug = v.slug
ON CONFLICT (ort_id, datum, titel) DO NOTHING;

-- Festplatz Plaue: Liebfrauenkirche (Google Maps, 50.7785746 / 10.9035468)
INSERT INTO festplatz (ort_id, name, lage)
SELECT o.id, 'Liebfrauenkirche', ST_SetSRID(ST_MakePoint(10.9035468, 50.7785746), 4326)::geography
  FROM ort o WHERE o.slug = 'plaue'
ON CONFLICT (ort_id, name) DO NOTHING;
