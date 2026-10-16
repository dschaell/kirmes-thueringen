/** Least Privilege: Die App-Rolle darf Daten lesen und schreiben, aber kein DDL (Issue #5). */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { richteAppLoginEin } from '../src/infrastructure/postgres/app-rolle.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();
const ROLLE = 'kirmes_app_it';

describe.runIf(url)('App-Rolle ohne DDL-Rechte (PostgreSQL)', () => {
  const owner = new pg.Pool({ connectionString: url ?? '', max: 1 });
  const passwort = randomBytes(24).toString('base64url');
  let app: pg.Pool;

  beforeAll(async () => {
    await richteAppLoginEin(owner, passwort, ROLLE);
    // zweimal ausführen: idempotent (ALTER statt CREATE)
    await richteAppLoginEin(owner, passwort, ROLLE);
    const u = new URL(url ?? '');
    u.username = ROLLE;
    u.password = passwort;
    app = new pg.Pool({ connectionString: u.toString(), max: 1 });
  });
  afterAll(async () => {
    await app?.end();
    const { rows } = await owner.query<{ a: string }>(
      `SELECT format('DROP ROLE IF EXISTS %I', $1::text) AS a`,
      [ROLLE],
    );
    await owner.query(rows[0]!.a);
    await owner.end();
  });

  const fehlercode = (p: Promise<unknown>) =>
    p.then(
      () => 'kein Fehler',
      (e: { code?: string }) => e.code,
    );

  it('liest und schreibt Daten', async () => {
    expect((await app.query('SELECT count(*)::int AS n FROM landkreis')).rows[0].n).toBe(23);
    await app.query("DELETE FROM ort WHERE slug = 'it-rolle'");
    const neu = await app.query(
      "INSERT INTO ort (slug, name, landkreis) VALUES ('it-rolle', 'IT-Rolle', 'GTH') RETURNING id",
    );
    expect(neu.rowCount).toBe(1);
    expect((await app.query("DELETE FROM ort WHERE slug = 'it-rolle'")).rowCount).toBe(1);
  });

  it('kein DROP, CREATE, ALTER, TRUNCATE – 42501 (keine Berechtigung)', async () => {
    expect(await fehlercode(app.query('DROP TABLE termin'))).toBe('42501');
    expect(await fehlercode(app.query('CREATE TABLE boese (id int)'))).toBe('42501');
    expect(await fehlercode(app.query('ALTER TABLE termin ADD COLUMN boese int'))).toBe('42501');
    expect(await fehlercode(app.query('TRUNCATE termin'))).toBe('42501');
  });

  it('Stammdaten und Migrationsbuch geschützt', async () => {
    expect(
      await fehlercode(app.query("UPDATE landkreis SET name = 'x' WHERE kuerzel = 'GTH'")),
    ).toBe('42501');
    expect(await fehlercode(app.query('SELECT * FROM schema_migration'))).toBe('42501');
  });

  it('lehnt kurze Passwörter und ungültige Rollennamen ab', async () => {
    await expect(richteAppLoginEin(owner, 'kurz', ROLLE)).rejects.toThrow('mindestens 16');
    await expect(richteAppLoginEin(owner, passwort, 'Böse; DROP')).rejects.toThrow('Ungültiger');
  });
});
