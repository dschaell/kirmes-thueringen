/** Erststart gegen PostgreSQL: Orte idempotent (#42), erster Admin genau einmal (#48). */
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgErsterAdmin } from '../src/infrastructure/postgres/admin-repository.js';
import { ladeOrte, type OrtEintrag } from '../src/infrastructure/postgres/erststart.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();

describe.runIf(url)('Erststart (PostgreSQL)', () => {
  const pool = new pg.Pool({ connectionString: url ?? '', max: 2 });
  afterAll(() => pool.end());

  /** Jeder Test in einer Transaktion, die zurückgerollt wird – die Test-DB bleibt unverändert. */
  async function inTransaktion(fn: (c: pg.PoolClient) => Promise<void>) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await fn(c);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  }

  const orte: OrtEintrag[] = [
    { slug: 'it-erst-a', name: 'Erststart A', landkreis: 'GTH', lat: 50.95, lon: 10.7 },
    { slug: 'it-erst-b', name: 'Erststart B', landkreis: 'IK', lat: 50.68, lon: 10.92 },
  ];

  it('lädt Orte und aktualisiert sie beim zweiten Lauf, ohne zu verdoppeln', async () => {
    await inTransaktion(async (c) => {
      expect(await ladeOrte(c, orte)).toBe(2);
      expect(await ladeOrte(c, [{ ...orte[0]!, name: 'Erststart Neu' }, orte[1]!])).toBe(2);
      const { rows } = await c.query<{ slug: string; name: string }>(
        "SELECT slug, name FROM ort WHERE slug LIKE 'it-erst-%' ORDER BY slug",
      );
      expect(rows).toEqual([
        { slug: 'it-erst-a', name: 'Erststart Neu' },
        { slug: 'it-erst-b', name: 'Erststart B' },
      ]);
    });
  });

  it('lässt von der Redaktion angelegte Orte unverändert', async () => {
    await inTransaktion(async (c) => {
      await c.query(
        "INSERT INTO ort (slug, name, landkreis, herkunft) VALUES ('it-erst-a', 'Von Hand', 'GTH', 'redaktion')",
      );
      expect(await ladeOrte(c, orte)).toBe(1);
      const { rows } = await c.query("SELECT name FROM ort WHERE slug = 'it-erst-a'");
      expect(rows[0].name).toBe('Von Hand');
    });
  });
});

/**
 * Erster Admin (Issue #48) in einem eigenen Schema: Die Tests leeren die Tabelle, ohne andere
 * Tests (die echte Admins in kirmes_test anlegen) zu stören.
 */
describe.runIf(url)('PgErsterAdmin (PostgreSQL)', () => {
  const owner = new pg.Pool({ connectionString: url ?? '', max: 1 });
  let pool: pg.Pool;
  let repo: PgErsterAdmin;

  beforeAll(async () => {
    await owner.query('DROP SCHEMA IF EXISTS it_erster_admin CASCADE');
    await owner.query('CREATE SCHEMA it_erster_admin');
    await owner.query('CREATE TABLE it_erster_admin.admin (LIKE public.admin INCLUDING ALL)');
    pool = new pg.Pool({
      connectionString: url ?? '',
      max: 6,
      options: '-c search_path=it_erster_admin',
    });
    repo = new PgErsterAdmin(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await owner.query('DROP SCHEMA IF EXISTS it_erster_admin CASCADE');
    await owner.end();
  });
  beforeEach(() => pool.query('DELETE FROM admin'));

  it('legt den ersten Admin an, danach keinen weiteren', async () => {
    expect(await repo.gibtEs()).toBe(false);
    const id = await repo.legeAn('erst@example.org', 'scrypt$1$1$1$a$b', 'JBSWY3DPEHPK3PXP');
    expect(id).toMatch(/^\d+$/);
    expect(await repo.gibtEs()).toBe(true);
    expect(await repo.legeAn('zweit@example.org', 'h', 'JBSWY3DPEHPK3PXP')).toBeNull();
    const { rows } = await pool.query('SELECT email FROM admin');
    expect(rows).toEqual([{ email: 'erst@example.org' }]);
  });

  it('auch bei gleichzeitigen Einrichtungen entsteht genau ein Konto', async () => {
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => repo.legeAn(`n${n}@example.org`, 'h', 'JBSWY3DPEHPK3PXP')),
    );
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM admin')).rows[0].n).toBe(1);
  });

  it('rollt bei Fehlern zurück und gibt die Verbindung frei', async () => {
    await expect(repo.legeAn('kaputt', 'h', 'JBSWY3DPEHPK3PXP')).rejects.toThrow(); // CHECK email
    expect(await repo.gibtEs()).toBe(false);
    expect(await repo.legeAn('ok@example.org', 'h', 'JBSWY3DPEHPK3PXP')).not.toBeNull();
  });
});
