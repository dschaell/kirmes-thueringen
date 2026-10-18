import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgKorrekturen } from '../src/infrastructure/postgres/korrektur-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();
describe.runIf(url)('Korrekturhinweise (PostgreSQL)', () => {
  const db = new pg.Pool({ connectionString: url, max: 4 });
  const repo = new PgKorrekturen(db);
  let terminId = '';
  let adminId = '';
  const bereinige = async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-korrektur'");
    await db.query("DELETE FROM admin WHERE name = 'IT Korrektur'");
  };
  beforeAll(async () => {
    await bereinige();
    const o = await db.query<{ id: string }>(
      "INSERT INTO ort(slug, name, landkreis) VALUES ('it-korrektur', 'IT Korrektur', 'IK') RETURNING id",
    );
    const t = await db.query<{ id: string }>(
      `INSERT INTO termin(ort_id, datum, titel, kategorie, quelle) VALUES ($1, '2027-09-17', 'Kirmestanz', 'party', 'Test') RETURNING id`,
      [o.rows[0]?.id],
    );
    terminId = t.rows[0]?.id ?? '';
    const a = await db.query<{ id: string }>(
      "INSERT INTO admin(name, rolle) VALUES ('IT Korrektur', 'redaktion') RETURNING id::text",
    );
    adminId = a.rows[0]?.id ?? '';
  });
  afterAll(async () => {
    await bereinige();
    await db.end();
  });
  it('legt an, listet mit Termin, zählt, erledigt und löscht den Kontakt', async () => {
    const vorher = await repo.anzahl();
    expect(
      await repo.lege({
        terminId,
        text: 'Beginn 19 Uhr',
        kontaktName: 'KG',
        kontaktEmail: 'kg@example.org',
      }),
    ).toBe(true);
    expect(await repo.anzahl()).toBe(vorher + 1);
    const k = (await repo.liste()).find((x) => x.termin.id === terminId);
    expect(k).toMatchObject({
      text: 'Beginn 19 Uhr',
      kontaktName: 'KG',
      termin: { titel: 'Kirmestanz', datum: '2027-09-17', beginn: null, ortName: 'IT Korrektur' },
    });
    expect(await repo.erledige(k!.id, adminId)).toBe(true);
    expect(await repo.erledige(k!.id, adminId)).toBe(false);
    const roh = await db.query(
      'SELECT kontakt_name, kontakt_email, erledigt_am FROM korrektur WHERE id = $1',
      [k!.id],
    );
    expect(roh.rows[0]).toMatchObject({ kontakt_name: null, kontakt_email: null });
    expect(roh.rows[0]?.erledigt_am).not.toBeNull();
  });
  it('unbekannter Termin und Obergrenze offener Hinweise', async () => {
    expect(
      await repo.lege({
        terminId: '00000000-0000-4000-8000-000000000000',
        text: 'x',
        kontaktName: null,
        kontaktEmail: null,
      }),
    ).toBe(false);
    for (let i = 0; i < 20; i++)
      await repo.lege({ terminId, text: `x${i}`, kontaktName: null, kontaktEmail: null });
    expect(
      await repo.lege({ terminId, text: 'zu viel', kontaktName: null, kontaktEmail: null }),
    ).toBe(false);
  });
  it('räumt alte Hinweise auf, niemals Termine', async () => {
    await db.query(
      `UPDATE korrektur SET erstellt_am = now() - interval '200 days',
         erledigt_am = CASE WHEN erledigt_am IS NULL THEN NULL ELSE now() - interval '31 days' END
       WHERE termin_id = $1`,
      [terminId],
    );
    await repo.raeumeAuf();
    expect(
      (await db.query('SELECT 1 FROM korrektur WHERE termin_id = $1', [terminId])).rowCount,
    ).toBe(0);
    expect((await db.query('SELECT 1 FROM termin WHERE id = $1', [terminId])).rowCount).toBe(1);
  });
});
