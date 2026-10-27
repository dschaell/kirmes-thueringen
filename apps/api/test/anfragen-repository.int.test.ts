import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgAnfragen } from '../src/infrastructure/postgres/anfragen-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Mitmach-Anfragen (PostgreSQL, #279)', () => {
  const db = new pg.Pool({ connectionString: url });
  const repo = new PgAnfragen(db);
  const loesche = () => db.query("DELETE FROM mitmach_anfrage WHERE name LIKE 'IT %'");
  beforeAll(loesche);
  afterAll(async () => {
    await loesche();
    await db.end();
  });
  it('legt an, listet offene zuerst, erledigt nur einmal und löscht die E-Mail', async () => {
    const neu = { email: 'it@example.org', ort: 'Mühlberg', info: 'Hallo' };
    expect(await repo.lege({ name: 'IT Erste', ...neu }, 10_000)).toBe(true);
    expect(await repo.lege({ name: 'IT Zweite', ...neu, ort: null, info: null }, 10_000)).toBe(
      true,
    );
    expect(await repo.lege({ name: 'IT Zu viel', ...neu }, 0)).toBe(false);
    const eigene = (await repo.liste()).filter((a) => a.name.startsWith('IT '));
    expect(eigene.map((a) => a.name)).toEqual(['IT Erste', 'IT Zweite']);
    const erste = eigene[0]!;
    expect(await repo.finde(erste.id)).toMatchObject({ status: 'offen', email: 'it@example.org' });
    expect(await repo.finde('kaputt')).toBeNull();
    const admin = await db.query<{ id: string }>('SELECT id::text FROM admin ORDER BY id LIMIT 1');
    const adminId = admin.rows[0]?.id ?? null;
    expect(await repo.erledige(erste.id, 'angenommen', adminId as string)).toBe(true);
    expect(await repo.erledige(erste.id, 'abgelehnt', adminId as string)).toBe(false);
    expect(await repo.finde(erste.id)).toMatchObject({ status: 'angenommen', email: null });
    const danach = (await repo.liste()).filter((a) => a.name.startsWith('IT '));
    expect(danach.map((a) => a.name)).toEqual(['IT Zweite', 'IT Erste']);
  });
  it('räumt alte Anfragen auf', async () => {
    await db.query(
      `UPDATE mitmach_anfrage SET eingegangen_am = now() - interval '200 days',
         erledigt_am = CASE WHEN status <> 'offen' THEN now() - interval '100 days' END
       WHERE name LIKE 'IT %'`,
    );
    await repo.raeumeAuf(90, 180);
    const r = await db.query(
      "SELECT count(*)::int AS n FROM mitmach_anfrage WHERE name LIKE 'IT %'",
    );
    expect(r.rows[0].n).toBe(0);
  });
});
