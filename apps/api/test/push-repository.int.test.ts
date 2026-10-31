import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgPush } from '../src/infrastructure/postgres/push-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();
describe.runIf(url)('Push-Abos (PostgreSQL, Issue #348)', () => {
  const db = new pg.Pool({ connectionString: url });
  const repo = new PgPush(db);
  const E = 'https://fcm.googleapis.com/fcm/send/it-push';
  let morgen = '';
  const ids: string[] = [];
  beforeAll(async () => {
    morgen =
      (await db.query<{ d: string }>('SELECT (current_date + 1)::text AS d')).rows[0]?.d ?? '';
    await db.query(
      "INSERT INTO ort (slug, name, landkreis) VALUES ('it-push-a', 'Push A', 'GTH'), ('it-push-b', 'Push B', 'GTH') ON CONFLICT (slug) DO NOTHING",
    );
    for (const [ort, titel, beginn] of [
      ['it-push-a', 'Kirmestanz', '20:00'],
      ['it-push-b', 'Frühschoppen', '10:00'],
      ['it-push-b', 'Disco', null],
    ]) {
      const r = await db.query<{ id: string }>(
        `INSERT INTO termin (ort_id, datum, beginn, titel, kategorie)
         SELECT id, $2::date, $3::time, $4, 'tanz' FROM ort WHERE slug = $1 RETURNING id`,
        [ort, morgen, beginn, titel],
      );
      ids.push(r.rows[0]?.id ?? '');
    }
  });
  afterAll(async () => {
    await db.query(
      "DELETE FROM push_abo WHERE endpoint LIKE 'https://fcm.googleapis.com/fcm/send/it-push%'",
    );
    await db.query("DELETE FROM ort WHERE slug LIKE 'it-push-%'");
    await db.end();
  });

  it('speichert je Gerät, ersetzt Listen, übergeht Unbekanntes, findet Empfänger', async () => {
    await repo.speichere({
      endpoint: E,
      p256dh: 'k1',
      auth: 'a1',
      orte: ['it-push-a', 'gibt-es-nicht'],
      termine: [],
      erinnerung: true,
    });
    await repo.speichere({
      endpoint: E,
      p256dh: 'k2',
      auth: 'a2',
      orte: ['it-push-a'],
      termine: [ids[1] ?? '', ids[2] ?? '', '00000000-0000-4000-8000-000000000000'],
      erinnerung: true,
    });
    expect(
      (await db.query('SELECT count(*)::int AS n FROM push_abo WHERE endpoint = $1', [E])).rows[0]
        ?.n,
    ).toBe(1);
    expect(await repo.empfaenger('it-push-a', [])).toEqual([
      { endpoint: E, p256dh: 'k2', auth: 'a2' },
    ]);
    expect(await repo.empfaenger('it-push-b', [ids[1] ?? ''])).toHaveLength(1);
    expect(await repo.empfaenger('it-push-c', ['00000000-0000-4000-8000-000000000000'])).toEqual(
      [],
    );
  });

  it('Erinnerung: gemerkte und Termine gefolgter Orte, nach Uhrzeit, nur einmal je Tag', async () => {
    await repo.speichere({
      endpoint: `${E}-2`,
      p256dh: 'k',
      auth: 'a',
      orte: ['it-push-b'],
      termine: [],
      erinnerung: false,
    });
    const r = (await repo.erinnerungen(morgen)).filter((e) => e.ziel.endpoint.startsWith(E));
    expect(r.map((e) => [e.ziel.endpoint, e.termine.map((t) => t.titel)])).toEqual([
      [E, ['Disco', 'Frühschoppen', 'Kirmestanz']],
    ]);
    expect(r[0]?.termine[1]).toMatchObject({
      ortSlug: 'it-push-b',
      ortName: 'Push B',
      beginn: '10:00',
      datum: morgen,
    });
    expect((await repo.erinnerungen(morgen)).filter((e) => e.ziel.endpoint.startsWith(E))).toEqual(
      [],
    );
  });

  it('Termin weg = Merk-Eintrag weg; abmelden; aufräumen nach Ablauf', async () => {
    await db.query('DELETE FROM termin WHERE id = $1', [ids[1]]);
    expect(await repo.empfaenger('it-push-x', [ids[1] ?? ''])).toEqual([]);
    expect(await repo.loesche(`${E}-2`)).toBe(true);
    expect(await repo.loesche(`${E}-2`)).toBe(false);
    await db.query(
      "UPDATE push_abo SET gesehen_am = now() - interval '500 days' WHERE endpoint = $1",
      [E],
    );
    await repo.raeumeAuf(400);
    expect((await db.query('SELECT 1 FROM push_abo WHERE endpoint = $1', [E])).rowCount).toBe(0);
  });

  it('Fehler rollt zurück', async () => {
    await expect(
      repo.speichere({
        endpoint: `${E}-3`,
        p256dh: 'k',
        auth: 'a',
        orte: [],
        termine: ['keine-uuid'],
        erinnerung: true,
      }),
    ).rejects.toThrow();
    expect(
      (await db.query('SELECT 1 FROM push_abo WHERE endpoint = $1', [`${E}-3`])).rowCount,
    ).toBe(0);
  });
});
