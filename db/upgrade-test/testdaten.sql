-- Testdaten für den Upgrade-Test (Issue #59): ein Stück jeder Tabelle mit Nutzer- und Zugangsdaten.
-- Wird nach den Migrationen des BASIS-Stands eingespielt; danach migriert der Test auf den neuen
-- Stand und prüft, dass jede Zeile und jeder Wert unverändert ist. Passt zum Schema ab Migration 010
-- und muss nur angepasst werden, wenn eine neue Tabelle mit Nutzerdaten dazukommt.
-- Landkreis kommt sonst erst aus der Synchronisation im Migrationslauf
INSERT INTO landkreis (kuerzel, name) VALUES ('IK', 'Ilm-Kreis') ON CONFLICT DO NOTHING;

INSERT INTO ort (slug, name, landkreis, lage)
VALUES ('ut-elleben', 'Elleben', 'IK', ST_SetSRID(ST_MakePoint(10.98, 50.83), 4326)::geography);

INSERT INTO termin (ort_id, datum, titel, kategorie, beginn, veranstaltungsort, bestaetigt, band, info, muttizettel)
SELECT id, DATE '2027-09-25', 'Kirmestanz', 'party', TIME '20:00', 'Festzelt', true, 'Belconda', 'Eintritt 8 €', true
  FROM ort WHERE slug = 'ut-elleben';

INSERT INTO festplatz (ort_id, name, lage)
SELECT id, 'Festzelt am Sportplatz', ST_SetSRID(ST_MakePoint(10.981, 50.831), 4326)::geography
  FROM ort WHERE slug = 'ut-elleben';

INSERT INTO bearbeitungslink (ort_id, token_hash, bezeichnung)
SELECT id, sha256('upgrade-test-link'::bytea), 'KG Elleben' FROM ort WHERE slug = 'ut-elleben';

INSERT INTO admin (name, rolle) VALUES ('Ryan', 'admin'), ('Moni', 'redaktion');

INSERT INTO admin_passkey (admin_id, credential_id, public_key, zaehler, transports, name)
SELECT id, 'upgrade-test-cred-' || name || '-ABCDEFGH', '\x0102030405'::bytea, 7, '{internal,hybrid}', 'iPhone'
  FROM admin WHERE name IN ('Ryan', 'Moni');

INSERT INTO admin_sitzung (token_hash, admin_id, laeuft_ab)
SELECT sha256(('upgrade-test-sitzung-' || name)::bytea), id, now() + interval '12 hours'
  FROM admin WHERE name IN ('Ryan', 'Moni');

INSERT INTO einladung (token_hash, rolle, erstellt_von, laeuft_ab)
SELECT sha256('upgrade-test-einladung'::bytea), 'redaktion', id, now() + interval '7 days'
  FROM admin WHERE name = 'Ryan';

INSERT INTO mitteilung (titel, text, erstellt_von)
SELECT 'Willkommen', 'Der Kalender ist da.', id FROM admin WHERE name = 'Ryan';

INSERT INTO veranstalter (name) VALUES ('KG Elleben');

INSERT INTO aenderungsprotokoll (aktion, details, admin_id)
SELECT 'termin_angelegt', '{"titel":"Kirmestanz"}'::jsonb, id FROM admin WHERE name = 'Ryan';

-- Neue Vorschlagstabellen ab 013: bei älteren Basisständen noch nicht vorhanden.
DO $$
BEGIN
  IF to_regclass('public.vorschlag') IS NOT NULL THEN
    INSERT INTO vorschlag(id, ort_id, kontakt_name, kontakt_email, nachricht)
    SELECT 'ef000000-0000-4000-8000-000000000001', id, 'KG Test', 'test@example.org', 'Bitte prüfen'
      FROM ort WHERE slug = 'ut-elleben';
    INSERT INTO vorschlag_termin(vorschlag_id, position, datum, titel, kategorie, speisen)
    VALUES ('ef000000-0000-4000-8000-000000000001', 1, '2027-09-26', 'Frühschoppen', 'tradition',
      '[{"name":"Klöße", "preisCent":950}]');
  END IF;
END $$;
