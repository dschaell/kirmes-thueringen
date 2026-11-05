-- datenaenderung-freigegeben: #414
-- Art-Korrektur (Issue #414, Folge von #409, Freigabe des Betreibers): genau vier Live-Termine hatten
-- eine falsche Art. Geändert wird nur, wenn ID, Titel und bisherige Art noch stimmen – wer den
-- Termin inzwischen von Hand angepasst hat, behält seine Wahl. Neue Version für Kalender-Abos.
-- Auf anderen Datenbanken (Test, lokal) gibt es die IDs nicht: dort ändert sich nichts.
UPDATE termin SET kategorie = k.neu, version = version + 1, geaendert_am = now()
  FROM (VALUES
    ('8093075c-93c2-42cc-9fb8-f2600851de78'::uuid, 'Posaunenblasen', 'party', 'tradition'),
    ('dbb9ae5c-9938-4f62-8b06-860cc2dc18e0'::uuid, 'Thüringer Mittagessen', 'party', 'sonstiges'),
    ('1c70b1e6-77dc-4384-9df9-d0623ae8ba53'::uuid, 'Kirmesdisco', 'sonstiges', 'party'),
    ('a68c5887-7dd4-47b3-a87e-fc37d6908b6e'::uuid, 'Kirmestanz', 'party', 'tanz')
  ) AS k(id, titel, alt, neu)
  WHERE termin.id = k.id AND termin.titel = k.titel AND termin.kategorie = k.alt;
