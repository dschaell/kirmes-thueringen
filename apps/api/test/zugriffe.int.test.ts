import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgZugriffe } from '../src/infrastructure/postgres/zugriffe-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Zugriffszahlen (PostgreSQL, Issue #311)', () => {
  const db = new pg.Pool({ connectionString: url });
  const z = new PgZugriffe(db);
  const P = '/it-zugriffe';
  afterAll(async () => {
    await db.query("DELETE FROM seitenaufruf WHERE pfad LIKE '/it-zugriffe%'");
    await db.end();
  });
  it('summiert je Tag und Pfad, Statistik, Aufräumen', async () => {
    await z.erfasse([{ pfad: P, anzahl: 2 }]);
    await z.erfasse([
      { pfad: P, anzahl: 3 },
      { pfad: `${P}/b`, anzahl: 1 },
    ]);
    const s = await z.statistik(7);
    expect(s.seiten.find((x) => x.pfad === P)?.anzahl).toBe(5);
    expect(s.tage[0]?.anzahl).toBeGreaterThanOrEqual(6);
    await db.query(
      "INSERT INTO seitenaufruf (tag, pfad, anzahl) VALUES (current_date - 500, '/it-zugriffe/alt', 1)",
    );
    await z.raeumeAuf(400);
    const alt = await db.query("SELECT 1 FROM seitenaufruf WHERE pfad = '/it-zugriffe/alt'");
    expect(alt.rowCount).toBe(0);
  });
});
