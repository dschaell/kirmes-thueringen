import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseDatum, type NeuerVorschlag, type VorschlagsTermin } from '@kirmes/core';
import { PgVorschlaege } from '../src/infrastructure/postgres/vorschlags-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Vorschläge (PostgreSQL)', () => {
  const db = new pg.Pool({ connectionString: url, max: 4 });
  const repo = new PgVorschlaege(db);
  let adminId = '';
  const datum = parseDatum('2027-09-17');
  if (!datum.ok) throw new Error('Testdatum ungültig');
  const termin: VorschlagsTermin = {
    ortSlug: 'it-vorschlag',
    landkreis: 'IK',
    datum: datum.value,
    beginn: '20:00',
    titel: 'Kirmestanz',
    veranstaltungsort: 'Festzelt',
    kategorie: 'party',
    bestaetigt: false,
    band: 'Band',
    info: 'Eintritt frei',
    muttizettel: true,
    speisen: [{ name: 'Klöße', preisCent: 950 }],
    platz: null,
  };
  const eingabe = (): NeuerVorschlag => ({
    ortSlug: 'it-vorschlag',
    kontaktName: 'KG',
    kontaktEmail: 'kg@example.org',
    nachricht: 'Rückfrage',
    termine: [termin],
  });
  const bereinige = async () => {
    await db.query(
      "DELETE FROM vorschlag WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
    );
    await db.query("DELETE FROM ort WHERE slug = 'it-vorschlag'");
    await db.query("DELETE FROM admin WHERE name = 'IT Vorschlag'");
  };
  beforeAll(async () => {
    await bereinige();
    await db.query(
      "INSERT INTO ort(slug, name, landkreis) VALUES ('it-vorschlag', 'IT Vorschlag', 'IK')",
    );
    const a = await db.query<{ id: string }>(
      "INSERT INTO admin(name, rolle) VALUES ('IT Vorschlag', 'redaktion') RETURNING id::text",
    );
    adminId = a.rows[0]?.id ?? '';
    expect(adminId).not.toBe('');
  });
  afterAll(async () => {
    await bereinige();
    await db.end();
  });
  it('speichert privat, liest geordnet mit Speisen und findet keine unbekannten IDs', async () => {
    expect(
      await repo.lege({
        ...eingabe(),
        termine: [
          {
            ...termin,
            titel: 'Vorverkauf',
            ende: '12:00',
            veranstalter: 'Feuerwehr',
            eintrittCent: 500,
          },
        ],
      }),
    ).toMatch(/^[0-9a-f-]{36}$/);
    // Endzeit, Veranstalter und Eintritt bleiben im Vorschlag erhalten (Issue #288, #353)
    const mitEnde = (await repo.liste()).find((v) => v.termine[0]?.titel === 'Vorverkauf');
    expect(mitEnde?.termine[0]).toMatchObject({
      ende: '12:00',
      veranstalter: 'Feuerwehr',
      eintrittCent: 500,
    });
    await db.query('DELETE FROM vorschlag WHERE id = $1::uuid', [mitEnde?.id]);
    expect(await repo.lege(eingabe())).toMatch(/^[0-9a-f-]{36}$/);
    const v = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag');
    expect(v).toMatchObject({
      kontaktName: 'KG',
      termine: [{ titel: 'Kirmestanz', beginn: '20:00', speisen: termin.speisen }],
    });
    expect(await repo.anzahl()).toBeGreaterThan(0);
    expect(await repo.finde(v?.id ?? '')).toEqual(v);
    expect(await repo.finde('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(
      (
        await db.query(
          "SELECT id FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
        )
      ).rowCount,
    ).toBe(0);
    expect(await repo.lege({ ...eingabe(), ortSlug: 'nicht-vorhanden' })).toBe(false);
  });
  it('übernimmt mit Speisen und Audit atomar und entfernt Kontakt und Nachricht', async () => {
    const v = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag');
    const id = v?.id ?? '';
    expect(
      await repo.uebernehme(
        id,
        [
          {
            ...termin,
            bestaetigt: true,
            ende: '02:00',
            veranstalter: 'Feuerwehr',
            eintrittCent: 0,
          },
        ],
        adminId,
      ),
    ).toBe(true);
    expect(await repo.finde(id)).toBeNull();
    const status = (
      await db.query(
        'SELECT status, kontakt_name, kontakt_email, nachricht, bearbeitet_von::text FROM vorschlag WHERE id = $1::uuid',
        [id],
      )
    ).rows[0];
    expect(status).toEqual({
      status: 'uebernommen',
      kontakt_name: null,
      kontakt_email: null,
      nachricht: null,
      bearbeitet_von: adminId,
    });
    expect(
      (
        await db.query(
          "SELECT bestaetigt, to_char(ende, 'HH24:MI') AS ende, veranstalter, eintritt_cent FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
        )
      ).rows,
    ).toEqual([{ bestaetigt: true, ende: '02:00', veranstalter: 'Feuerwehr', eintritt_cent: 0 }]);
    expect(
      (
        await db.query(
          "SELECT s.name, s.preis_cent FROM termin_speise s JOIN termin t ON t.id = s.termin_id JOIN ort o ON o.id = t.ort_id WHERE o.slug = 'it-vorschlag'",
        )
      ).rows,
    ).toEqual([{ name: 'Klöße', preis_cent: 950 }]);
    expect(
      (
        await db.query(
          "SELECT admin_id::text, details FROM aenderungsprotokoll WHERE aktion = 'vorschlag_uebernommen' AND details->>'id' = $1",
          [id],
        )
      ).rows,
    ).toEqual([{ admin_id: adminId, details: { id, anzahl: 1 } }]);
    expect(await repo.uebernehme(id, [termin], adminId)).toBe(false);
  });
  it('rollt Termine, Speisen, Audit und Status bei einem späteren Fehler komplett zurück', async () => {
    await repo.lege(eingabe());
    const id = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag')?.id ?? '';
    expect(await repo.uebernehme(id, [{ ...termin, titel: 'Neuer Tanz' }, termin], adminId)).toBe(
      'KONFLIKT',
    );
    expect(await repo.finde(id)).toMatchObject({ kontaktEmail: 'kg@example.org' });
    expect(
      (
        await db.query(
          "SELECT id FROM termin WHERE titel = 'Neuer Tanz' AND ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
        )
      ).rowCount,
    ).toBe(0);
    expect(await repo.uebernehme(id, [{ ...termin, ortSlug: 'fehlt' }], adminId)).toBe('KONFLIKT');
  });
  it('unbekanntes Mitglied rollt auch nach dem Anlegen alle Daten zurück', async () => {
    const id = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag')?.id ?? '';
    await expect(
      repo.uebernehme(id, [{ ...termin, titel: 'Rollback ohne Mitglied' }], '9223372036854775806'),
    ).rejects.toThrow();
    expect(await repo.finde(id)).toMatchObject({ kontaktEmail: 'kg@example.org' });
    expect(
      (await db.query("SELECT id FROM termin WHERE titel = 'Rollback ohne Mitglied'")).rowCount,
    ).toBe(0);
  });
  it('Ablehnen veröffentlicht nichts und löscht Kontakt sofort; zweiter Aufruf ändert nichts', async () => {
    const id = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag')?.id ?? '';
    expect(await repo.lehneAb(id, 'Doppelt', adminId)).toBe(true);
    expect(await repo.lehneAb(id, null, adminId)).toBe(false);
    expect(
      (
        await db.query(
          'SELECT status, kontakt_name, kontakt_email, nachricht, grund FROM vorschlag WHERE id = $1::uuid',
          [id],
        )
      ).rows[0],
    ).toEqual({
      status: 'abgelehnt',
      kontakt_name: null,
      kontakt_email: null,
      nachricht: null,
      grund: 'Doppelt',
    });
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
  it('höchstens 50 offene je Ort, auch bei gleichzeitigen Einreichungen', async () => {
    for (let i = 0; i < 49; i++) expect(await repo.lege(eingabe())).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (
        await Promise.all([repo.lege(eingabe()), repo.lege(eingabe()), repo.lege(eingabe())])
      ).filter(Boolean),
    ).toHaveLength(1);
    expect(await repo.lege(eingabe())).toBe(false);
  });
  it('Aufräumen hält 30/180 Tage ein, ist idempotent und lässt öffentliche Termine unberührt', async () => {
    await db.query(
      "UPDATE vorschlag SET erstellt_am = now() - interval '181 days' WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag') AND status = 'offen'",
    );
    await db.query(
      "UPDATE vorschlag SET bearbeitet_am = now() - interval '31 days' WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag') AND status <> 'offen'",
    );
    await repo.raeumeAuf();
    await repo.lege(eingabe());
    const frisch = (await repo.liste()).find((v) => v.ortSlug === 'it-vorschlag')?.id;
    await repo.raeumeAuf();
    await repo.raeumeAuf();
    expect(
      (await repo.liste()).filter((v) => v.ortSlug === 'it-vorschlag').map((v) => v.id),
    ).toEqual([frisch]);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-vorschlag')",
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
});

describe.runIf(url)('Vorschlag mit Kartenpunkt (Issue #169)', () => {
  const db = new pg.Pool({ connectionString: url, max: 2 });
  const repo = new PgVorschlaege(db);
  let adminId = '';
  const d = parseDatum('2027-09-18');
  if (!d.ok) throw new Error('Testdatum ungültig');
  const termin = (titel: string, platzUebernehmen: boolean): VorschlagsTermin => ({
    ortSlug: 'it-kartenpunkt',
    landkreis: 'IK',
    datum: d.value,
    beginn: null,
    titel,
    veranstaltungsort: `Kirche ${titel}`,
    kategorie: 'tradition',
    bestaetigt: false,
    muttizettel: false,
    speisen: [],
    platz: { lat: 50.860399, lon: 11.093031 },
    platzUebernehmen,
  });
  const bereinige = async () => {
    await db.query(
      "DELETE FROM vorschlag WHERE ort_id IN (SELECT id FROM ort WHERE slug = 'it-kartenpunkt')",
    );
    await db.query("DELETE FROM ort WHERE slug = 'it-kartenpunkt'");
    await db.query("DELETE FROM admin WHERE name = 'IT Kartenpunkt'");
  };
  beforeAll(async () => {
    await bereinige();
    await db.query(
      "INSERT INTO ort(slug, name, landkreis) VALUES ('it-kartenpunkt', 'IT Kartenpunkt', 'IK')",
    );
    adminId =
      (
        await db.query<{ id: string }>(
          "INSERT INTO admin(name, rolle) VALUES ('IT Kartenpunkt', 'redaktion') RETURNING id::text",
        )
      ).rows[0]?.id ?? '';
  });
  afterAll(async () => {
    await bereinige();
    await db.end();
  });

  it('speichert nur Zahlen, Platz entsteht nur mit Haken', async () => {
    expect(
      await repo.lege({
        ortSlug: 'it-kartenpunkt',
        kontaktName: null,
        kontaktEmail: null,
        nachricht: null,
        termine: [termin('A', false), { ...termin('B', false), platz: null }],
      }),
    ).toMatch(/^[0-9a-f-]{36}$/);
    const spalten = await db.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'vorschlag_termin' AND column_name LIKE 'platz%' ORDER BY 1`,
    );
    expect(spalten.rows).toEqual([
      { column_name: 'platz_lat', data_type: 'double precision' },
      { column_name: 'platz_lon', data_type: 'double precision' },
    ]);
    const v = (await repo.liste()).find((x) => x.ortSlug === 'it-kartenpunkt');
    expect(v?.termine.map((t) => t.platz)).toEqual([{ lat: 50.860399, lon: 11.093031 }, null]);
    // Übernahme: A mit Haken → Platz, B ohne Punkt → nichts
    expect(
      await repo.uebernehme(
        v?.id ?? '',
        [termin('A', true), { ...termin('B', true), platz: null }],
        adminId,
      ),
    ).toBe(true);
    const plaetze = await db.query(
      `SELECT name, round(ST_Y(lage::geometry)::numeric, 6)::float8 AS lat
         FROM festplatz WHERE ort_id = (SELECT id FROM ort WHERE slug = 'it-kartenpunkt')`,
    );
    expect(plaetze.rows).toEqual([{ name: 'Kirche A', lat: 50.860399 }]);
  });

  it('ohne Haken kein Platz', async () => {
    await repo.lege({
      ortSlug: 'it-kartenpunkt',
      kontaktName: null,
      kontaktEmail: null,
      nachricht: null,
      termine: [termin('C', false)],
    });
    const v = (await repo.liste()).find((x) => x.ortSlug === 'it-kartenpunkt');
    await repo.uebernehme(v?.id ?? '', [termin('C', false)], adminId);
    const n = await db.query(
      `SELECT count(*)::int AS n FROM festplatz
        WHERE ort_id = (SELECT id FROM ort WHERE slug = 'it-kartenpunkt') AND name = 'Kirche C'`,
    );
    expect(n.rows[0]?.n).toBe(0);
  });
});
