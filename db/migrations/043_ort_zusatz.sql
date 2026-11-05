-- datenaenderung-freigegeben: #406
-- Ortsverzeichnis (Issue #406): Namensvettern im selben Kreis bekommen einen Zusatz ("bei Apolda")
-- statt des Slugs in der Ortsauswahl. Neue Spalte, additiv.
ALTER TABLE ort ADD COLUMN zusatz text;

UPDATE ort SET zusatz = z.zusatz
  FROM (VALUES
  ('bernterode-eic', 'bei Bleicherode'),
  ('bernterode-eic-2', 'bei Heilbad Heiligenstadt'),
  ('brandenstein-sok', 'bei Ranis'),
  ('brandenstein', 'bei Schleiz'),
  ('burkersdorf-abg-2', 'bei Altenburg'),
  ('burkersdorf-abg', 'bei Schmölln'),
  ('burkersdorf-sok', 'bei Triptis'),
  ('burkersdorf-sok-2', 'bei Auma'),
  ('gruena-grz', 'bei Zeulenroda'),
  ('gruena', 'bei Gera'),
  ('heiersdorf', 'bei Altenburg'),
  ('heiersdorf-abg', 'bei Gößnitz'),
  ('kauern-grz', 'bei Ronneburg'),
  ('kauern-grz-2', 'bei Triebes'),
  ('kleingeschwenda-slf', 'bei Saalfeld/Saale'),
  ('kleingeschwenda-slf-2', 'bei Ranis'),
  ('lichtenhain-slf', 'bei Oberweißbach'),
  ('lichtenhain-slf-2', 'bei Gräfenthal'),
  ('lindigshof-wak', 'bei Dermbach'),
  ('lindigshof-wak-2', 'bei Marksuhl'),
  ('lohma-abg', 'bei Altenburg'),
  ('lohma-abg-2', 'bei Schmölln'),
  ('markersdorf-grz', 'bei Weida'),
  ('markersdorf-grz-2', 'bei Gera'),
  ('meckfeld-wl', 'bei Magdala'),
  ('meckfeld-wl-2', 'bei Bad Berka'),
  ('milbitz-slf', 'bei Königsee'),
  ('milbitz-slf-2', 'bei Rudolstadt'),
  ('nauendorf-wl', 'bei Kranichfeld'),
  ('nauendorf-wl-2', 'bei Apolda'),
  ('naundorf-abg', 'bei Meuselwitz'),
  ('naundorf-abg-2', 'bei Gößnitz'),
  ('neundorf-sok', 'bei Bad Lobenstein'),
  ('neundorf-sok-2', 'bei Schleiz'),
  ('pferdsdorf-wak', 'bei Unterbreizbach'),
  ('pferdsdorf-wak-2', 'bei Creuzburg'),
  ('pohlitz-grz', 'bei Greiz'),
  ('pohlitz-grz-2', 'bei Gera'),
  ('reichenbach-slf', 'bei Gräfenthal'),
  ('reichenbach-slf-2', 'bei Saalfeld/Saale'),
  ('roda-ik', 'bei Ilmenau'),
  ('roda', 'bei Stadtilm'),
  ('schwabsdorf', 'bei Weimar'),
  ('schwabsdorf-wl', 'bei Bad Sulza'),
  ('schwarzbach-grz', 'bei Triptis'),
  ('schwarzbach-grz-2', 'bei Zeulenroda'),
  ('thomas-muentzer-siedlung-abg', 'bei Altenburg'),
  ('thomas-muentzer-siedlung-abg-2', 'bei Gößnitz'),
  ('thomas-muentzer-siedlung-slf', 'bei Gräfenthal'),
  ('thomas-muentzer-siedlung-slf-2', 'bei Lehesten'),
  ('waltersdorf-grz', 'bei Greiz'),
  ('waltersdorf-grz-2', 'bei Hermsdorf'),
  ('zickra-grz', 'bei Auma'),
  ('zickra-grz-2', 'bei Weida'),
  ('zschernitzsch', 'bei Schmölln'),
  ('zschernitzsch-abg', 'bei Altenburg')
  ) AS z(slug, zusatz)
 WHERE ort.slug = z.slug AND ort.herkunft = 'osm';

-- Vier Orte führt OpenStreetMap doppelt (village und hamlet, keine 1,5 km auseinander). Freigabe
-- durch den Betreiber: der zweite Eintrag kommt weg – aber nur, wenn keine Tabelle auf ihn verweist
-- (Termine, Plätze, Konten, Einladungen, Push-Abos, Beiträge …; per Fremdschlüssel ermittelt, damit
-- kein ON DELETE CASCADE Nutzerdaten mitnimmt).
DO $$
DECLARE
  o record;
  fk record;
  benutzt boolean;
BEGIN
  FOR o IN SELECT id, slug FROM ort
            WHERE herkunft = 'osm'
              AND slug IN ('gleicherwiesen-hbn', 'zschoepel-abg', 'schaderthal-slf-2', 'trebanz-abg')
  LOOP
    benutzt := false;
    FOR fk IN SELECT c.conrelid::regclass AS tabelle, a.attname AS spalte
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
               WHERE c.contype = 'f' AND c.confrelid = 'ort'::regclass
    LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', fk.tabelle, fk.spalte)
         INTO benutzt USING o.id;
      EXIT WHEN benutzt;
    END LOOP;
    IF NOT benutzt THEN
      DELETE FROM ort WHERE id = o.id;
    ELSE
      RAISE NOTICE 'Ort % bleibt – wird noch verwendet', o.slug;
    END IF;
  END LOOP;
END $$;
