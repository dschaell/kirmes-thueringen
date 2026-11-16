-- datenaenderung-freigegeben: #436
-- Festplätze und Orte aus Rückmeldungen (Issue #436): nur Zeilen aus #429/#434, keine fremden Daten.

-- Ladies Night ist am Klettbacher Beach
UPDATE termin SET veranstaltungsort = 'Klettbacher Beach', version = version + 1, geaendert_am = now()
 WHERE titel = 'Ladies Night' AND datum = DATE '2026-08-20' AND ort_id = (SELECT id FROM ort WHERE slug = 'klettbach');

-- Gutendorf: Kulturhaus statt Festsaal, Beginn = Einlass 20:00
UPDATE termin SET veranstaltungsort = 'Kulturhaus', beginn = TIME '20:00:00', version = version + 1, geaendert_am = now()
 WHERE titel = 'Gruselige House-Kirmes' AND datum = DATE '2026-10-30' AND ort_id = (SELECT id FROM ort WHERE slug = 'gutendorf');

-- Festplätze (Google Maps)
INSERT INTO festplatz (ort_id, name, lage)
SELECT o.id, v.name, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
  FROM (VALUES
    ('klettbach', 'Klettbacher Beach', 11.14709779336059::float8, 50.9170289256773::float8),
    ('gutendorf', 'Kulturhaus', 11.2073184::float8, 50.9200761::float8),
    ('grossliebringen', 'Festzelt (beheizt)', 11.123710025644037::float8, 50.75095378513029::float8)
  ) AS v(slug, name, lng, lat)
  JOIN ort o ON o.slug = v.slug
ON CONFLICT (ort_id, name) DO NOTHING;
