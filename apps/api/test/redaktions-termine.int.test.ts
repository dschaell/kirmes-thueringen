import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { RedaktionsTermine, type KalenderDatum } from '@kirmes/core';
import { PgTerminRepository } from '../src/infrastructure/postgres/termin-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Redaktionsliste über PostgreSQL', () => {
  const db = new pg.Pool({ connectionString: url });
  const liste = new RedaktionsTermine(
    new PgTerminRepository(db),
    {
      pruefe: async () => ({ adminId: '1', name: 'Test', rolle: 'redaktion' }),
      lege: async () => {},
      beende: async () => {},
    },
    { heute: () => '2026-10-16' as KalenderDatum },
  );
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug='it-redaktionsliste'");
    await db.query(
      "INSERT INTO ort(slug,name,landkreis) VALUES ('it-redaktionsliste','IT Listenort','IK')",
    );
    await db.query(
      `INSERT INTO termin(ort_id, datum, titel, kategorie, band) SELECT id, d.datum::date, d.titel, 'party', d.band FROM ort CROSS JOIN (VALUES ('2020-09-18','IT Liste Vergangenheit',NULL), ('2027-09-18','IT Liste Tanz','IT Musik'), ('2030-09-18','IT Liste Weit voraus',NULL)) d(datum,titel,band) WHERE slug='it-redaktionsliste'`,
    );
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug='it-redaktionsliste'");
    await db.end();
  });
  it('Ort, Titel, Band, Datum sowie vergangene Termine und Folgeseiten', async () => {
    const kommende = await liste.liste('sitzung', { q: 'IT Listenort', limit: 1 });
    expect(kommende).toMatchObject({
      ok: true,
      value: { gesamt: 2, eintraege: [{ titel: 'IT Liste Tanz' }] },
    });
    const seite2 = await liste.liste('sitzung', { q: 'IT Listenort', limit: 1, offset: 1 });
    expect(seite2).toMatchObject({
      ok: true,
      value: { gesamt: 2, eintraege: [{ titel: 'IT Liste Weit voraus' }] },
    });
    expect(await liste.liste('sitzung', { q: 'IT Listenort', offset: 25 })).toMatchObject({
      ok: true,
      value: { gesamt: 2, eintraege: [] },
    });
    expect(
      await liste.liste('sitzung', { q: 'IT Liste Vergangenheit', zeitraum: 'vergangen' }),
    ).toMatchObject({ ok: true, value: { gesamt: 1, eintraege: [{ datum: '2020-09-18' }] } });
    expect(await liste.liste('sitzung', { q: 'IT Musik' })).toMatchObject({
      ok: true,
      value: { gesamt: 1 },
    });
    expect(await liste.liste('sitzung', { q: 'IT Listenort', datum: '2020-09-18' })).toMatchObject({
      ok: true,
      value: { gesamt: 1 },
    });
    expect(await liste.liste('sitzung', { q: 'IT Listenort', zeitraum: 'alle' })).toMatchObject({
      ok: true,
      value: { gesamt: 3 },
    });
  });
});
