/** Erststart gegen PostgreSQL (Issue #42): Orte idempotent, erster Admin nur in leerer Tabelle. */
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ladeOrte,
  legeErstenAdminAn,
  type OrtEintrag,
} from '../src/infrastructure/postgres/erststart.js';
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

  const start = {
    email: 'erststart@example.org',
    passwortHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
    totpGeheimnis: 'JBSWY3DPEHPK3PXP',
  };

  it('legt den ersten Admin genau einmal an', async () => {
    await inTransaktion(async (c) => {
      await c.query('DELETE FROM admin');
      expect(await legeErstenAdminAn(c, start)).toBe(true);
      expect(await legeErstenAdminAn(c, { ...start, passwortHash: 'anders' })).toBe(false);
      const { rows } = await c.query('SELECT email, passwort_hash FROM admin');
      expect(rows).toEqual([{ email: start.email, passwort_hash: start.passwortHash }]);
    });
  });

  it('ändert nichts, sobald es irgendeinen Admin gibt', async () => {
    await inTransaktion(async (c) => {
      await c.query('DELETE FROM admin');
      await c.query(
        "INSERT INTO admin (email, passwort_hash, totp_geheimnis) VALUES ('schon-da@example.org', 'x', 'JBSWY3DPEHPK3PXP')",
      );
      expect(await legeErstenAdminAn(c, start)).toBe(false);
      const { rows } = await c.query('SELECT email FROM admin');
      expect(rows).toEqual([{ email: 'schon-da@example.org' }]);
    });
  });
});
