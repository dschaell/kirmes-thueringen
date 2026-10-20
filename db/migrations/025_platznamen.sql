-- datenaenderung-freigegeben: #213
-- Einmalige Bereinigung der Platznamen (Issue #213, Entscheidung des Betreibers): Namen wie bei
-- Google Maps, Tippfehler korrigiert. Gezielt: Der Ort wird über eine bekannte Termin-ID bestimmt
-- (mehrere Orte heißen gleich, z. B. Holzhausen); gibt es die ID nicht (andere Datenbank), passiert
-- nichts. Geänderte Termine bekommen eine neue Version, damit Kalender-Abos sie aktualisieren.
-- Alle anderen Daten bleiben unverändert.
CREATE TEMP TABLE platz_umbenennung (anker uuid, alt text, neu text) ON COMMIT DROP;
INSERT INTO platz_umbenennung VALUES
  ('01a5e238-8293-4294-8be6-16d05b3e8c37', 'Kirche Holzhausen', 'Dreifaltigkeitskirche'),
  ('01a5e238-8293-4294-8be6-16d05b3e8c37', 'Wiese der TM-Ranch', 'TM Ranch'),
  ('d877b379-7881-45d7-9ccf-0f954d32128e', 'Kirche Alkersleben', 'St. Gregorius'),
  ('243cedae-83e5-4c02-a1da-74b6777d8942', 'Kirche', 'St. Georg'),
  ('fd3b9f1d-bd32-4b19-b616-64416df16f57', 'Kirche Elleben', 'St. Marien'),
  ('fd3b9f1d-bd32-4b19-b616-64416df16f57', 'Gasthaus zum Einkrehrenden Apostel Elleben', 'Gaststätte Zum einkehrenden Apostel'),
  ('139ac6b5-133b-4fc5-9012-125b8d95a923', 'Bauernscheune', 'Bauernscheune Bösleben');

UPDATE termin t
   SET veranstaltungsort = u.neu, version = t.version + 1, geaendert_am = now()
  FROM platz_umbenennung u
 WHERE t.ort_id = (SELECT ort_id FROM termin WHERE id = u.anker)
   AND t.veranstaltungsort = u.alt;

-- Festplatz mitnehmen, sofern es unter dem neuen Namen noch keinen gibt
UPDATE festplatz f
   SET name = u.neu, geaendert_am = now()
  FROM platz_umbenennung u
 WHERE f.ort_id = (SELECT ort_id FROM termin WHERE id = u.anker)
   AND f.name = u.alt
   AND NOT EXISTS (SELECT 1 FROM festplatz g WHERE g.ort_id = f.ort_id AND g.name = u.neu);

-- Kirmesparty Elleben: als Platz stand die Band (die schon im Feld Band steht)
UPDATE termin
   SET veranstaltungsort = 'Gaststätte Zum einkehrenden Apostel', version = version + 1,
       geaendert_am = now()
 WHERE id = '23ed7542-1587-49c3-bc91-866131531bc6' AND veranstaltungsort = 'Takt X Rockband';

-- Tippfehler in Titeln (nur in den beiden betroffenen Orten)
UPDATE termin t
   SET titel = v.neu, version = t.version + 1, geaendert_am = now()
  FROM (VALUES
    ('01a5e238-8293-4294-8be6-16d05b3e8c37'::uuid, 'Senoirennachmittag', 'Seniorennachmittag'),
    ('d877b379-7881-45d7-9ccf-0f954d32128e'::uuid, 'Traditionelles Frühshoppen', 'Traditionelles Frühschoppen')
  ) AS v (anker, alt, neu)
 WHERE t.ort_id = (SELECT ort_id FROM termin WHERE id = v.anker)
   AND t.titel = v.alt
   AND NOT EXISTS (
     SELECT 1 FROM termin d WHERE d.ort_id = t.ort_id AND d.datum = t.datum AND d.titel = v.neu
   );
