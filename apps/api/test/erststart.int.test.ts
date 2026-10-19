/** Erststart gegen PostgreSQL: Orte idempotent (#42), Konten/Einladungen sicher (#48, #56). */
import pg from 'pg';
import { LetzterAdmin } from '@kirmes/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PgEinladungen,
  PgErsterAdmin,
  PgKontoAnlage,
  PgMitglieder,
} from '../src/infrastructure/postgres/admin-repository.js';
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
 * Konten, Einladungen und Mitglieder (Issues #48, #56) in einem eigenen Schema: Die Tests leeren
 * die Tabellen, ohne andere Tests (die in kirmes_test eigene Konten anlegen) zu stören.
 */
describe.runIf(url)('Redaktionskonten (PostgreSQL)', () => {
  const owner = new pg.Pool({ connectionString: url ?? '', max: 1 });
  let pool: pg.Pool;
  const schluessel = (cred: string) => ({
    credentialId: `it-cred-${cred}-ABCDEFGHIJKLMNOP`,
    publicKey: new Uint8Array([1, 2, 3]),
    zaehler: 0,
    transports: ['internal'],
  });
  const konto = (name: string, rolle: 'admin' | 'redaktion' = 'admin') => ({
    name,
    rolle,
    kennung: randomUUID(),
  });

  beforeAll(async () => {
    await owner.query('DROP SCHEMA IF EXISTS it_konten CASCADE');
    await owner.query('CREATE SCHEMA it_konten');
    await owner.query('CREATE TABLE it_konten.admin (LIKE public.admin INCLUDING ALL)');
    await owner.query(
      'CREATE TABLE it_konten.admin_passkey (LIKE public.admin_passkey INCLUDING ALL)',
    );
    await owner.query('CREATE TABLE it_konten.einladung (LIKE public.einladung INCLUDING ALL)');
    pool = new pg.Pool({
      connectionString: url ?? '',
      max: 6,
      // public dahinter: Ort-Namen für Kirmesgesellschaften (Issue #180)
      options: '-c search_path=it_konten,public',
    });
  });
  afterAll(async () => {
    await pool?.end();
    await owner.query('DROP SCHEMA IF EXISTS it_konten CASCADE');
    await owner.end();
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM einladung');
    await pool.query('DELETE FROM admin_passkey');
    await pool.query('DELETE FROM admin');
  });

  it('erster Admin: genau einer, auch bei gleichzeitigen Einrichtungen', async () => {
    const anlage = new PgKontoAnlage(pool);
    const erster = new PgErsterAdmin(pool);
    expect(await erster.gibtEs()).toBe(false);
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        anlage.lege(konto(`A${n}`), schluessel(`a${n}`), 'Erster Passkey', { art: 'erster-admin' }),
      ),
    );
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect(await erster.gibtEs()).toBe(true);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM admin_passkey');
    expect(rows[0].n).toBe(1); // Konto und Passkey nur gemeinsam
  });

  it('rollt bei Fehlern zurück (kein Konto ohne Passkey)', async () => {
    const anlage = new PgKontoAnlage(pool);
    const kaputt = { ...schluessel('x'), credentialId: 'zu-kurz' }; // CHECK-Verletzung
    await expect(
      anlage.lege(konto('Kaputt'), kaputt, 'x', { art: 'erster-admin' }),
    ).rejects.toThrow();
    expect((await pool.query('SELECT count(*)::int AS n FROM admin')).rows[0].n).toBe(0);
  });

  it('Einladung: Hash statt Token, genau einmal nutzbar, widerrufbar', async () => {
    const einl = new PgEinladungen(pool);
    const anlage = new PgKontoAnlage(pool);
    const token = 'T'.repeat(43);
    const e = await einl.lege(token, 'redaktion', null, 7);
    expect(e).toMatchObject({ rolle: 'redaktion' });
    const roh = await pool.query('SELECT token_hash FROM einladung');
    expect(roh.rows[0].token_hash).toHaveLength(32);
    expect(Buffer.from(roh.rows[0].token_hash).toString()).not.toContain('TTTT');
    expect(await einl.finde(token)).toEqual({ id: e.id, rolle: 'redaktion' });
    expect(await einl.finde('X'.repeat(43))).toBeNull();
    expect(await einl.finde("' OR 1=1 --")).toBeNull();
    expect(await einl.offene()).toHaveLength(1);

    // zwei gleichzeitige Annahmen → nur eine gelingt
    const ids = await Promise.all(
      ['m1', 'm2'].map((c) =>
        anlage.lege(konto(`M-${c}`, 'redaktion'), schluessel(c), 'Erster Passkey', {
          art: 'einladung',
          einladungId: e.id,
        }),
      ),
    );
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect(await einl.finde(token)).toBeNull();
    expect(await einl.offene()).toHaveLength(0);
    const genutzt = await pool.query('SELECT genutzt_von::text FROM einladung');
    expect(genutzt.rows[0].genutzt_von).toBe(ids.find(Boolean));
    expect(await einl.widerrufe(e.id)).toBe(false); // genutzte bleibt (Nachweis)

    const z = await einl.lege('Z'.repeat(43), 'admin', null, 7, 'Kirmesverein Muster');
    expect(z.bezeichnung).toBe('Kirmesverein Muster');
    expect((await einl.offene()).find((e) => e.id === z.id)?.bezeichnung).toBe(
      'Kirmesverein Muster',
    );
    expect(await einl.widerrufe(z.id)).toBe(true);
    expect(await einl.finde('Z'.repeat(43))).toBeNull();
    expect(await einl.widerrufe('kein-id')).toBe(false);
    // abgelaufen
    await einl.lege('A'.repeat(43), 'admin', null, 0);
    expect(await einl.finde('A'.repeat(43))).toBeNull();
  });

  it('Mitglieder: Liste, Rolle, Entfernen', async () => {
    const anlage = new PgKontoAnlage(pool);
    const m = new PgMitglieder(pool);
    const id = (await anlage.lege(konto('Ryan'), schluessel('r'), 'Mac', {
      art: 'erster-admin',
    }))!;
    const liste = await m.liste();
    expect(liste).toEqual([
      expect.objectContaining({
        id,
        name: 'Ryan',
        rolle: 'admin',
        passkeys: 1,
        letzterLogin: null,
      }),
    ]);
    expect(await m.anzahlAdmins()).toBe(1);
    await expect(m.setzeRolle(id, 'redaktion')).rejects.toBeInstanceOf(LetzterAdmin);
    await expect(m.entferne(id)).rejects.toBeInstanceOf(LetzterAdmin);
    await pool.query("INSERT INTO admin(name,rolle) VALUES ('Reserve im Mitgliedertest','admin')");
    expect(await m.setzeRolle(id, 'redaktion')).toBe(true);
    expect(await m.anzahlAdmins()).toBe(1);
    expect(await m.setzeRolle('999999', 'admin')).toBe(false);
    expect(await m.setzeRolle('x', 'admin')).toBe(false);
    expect(await m.entferne(id)).toBe(true);
    expect(await m.entferne(id)).toBe(false);
    expect(await m.entferne('x')).toBe(false);
  });
});
