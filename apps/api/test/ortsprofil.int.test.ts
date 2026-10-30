import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgOrtRepository } from '../src/infrastructure/postgres/ort-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Vereinsprofil (PostgreSQL, Issue #310)', () => {
  const db = new pg.Pool({ connectionString: url });
  const orte = new PgOrtRepository(db);
  let adminId = '';
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-profil'");
    await db.query("DELETE FROM admin WHERE name = 'IT Profil'");
    await db.query(
      "INSERT INTO ort(slug,name,landkreis,kg_name) VALUES ('it-profil','IT Profil','IK','IT Verein')",
    );
    adminId = (
      await db.query<{ id: string }>(
        "INSERT INTO admin(name, rolle) VALUES ('IT Profil', 'redaktion') RETURNING id::text",
      )
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-profil'");
    await db.query("DELETE FROM admin WHERE name = 'IT Profil'");
    await db.end();
  });
  it('ohne Profil null, speichern mit Protokoll, leeren, unbekannter Ort', async () => {
    expect(await orte.finde('it-profil')).toMatchObject({ kgName: 'IT Verein', profil: null });
    const p = {
      text: 'Seit 1890',
      website: 'https://kv.de/',
      instagram: null,
      facebook: null,
      kontakt: 'info@kv.de',
    };
    expect(await orte.setze('it-profil', p, adminId)).toBe(true);
    expect((await orte.finde('it-profil'))?.profil).toEqual(p);
    const leer = { text: null, website: null, instagram: null, facebook: null, kontakt: null };
    expect(await orte.setze('it-profil', leer, adminId)).toBe(true);
    expect((await orte.finde('it-profil'))?.profil).toBeNull();
    expect(await orte.setze('gibt-es-nicht', leer, adminId)).toBe(false);
    const prot = await db.query(
      "SELECT count(*)::int AS n FROM aenderungsprotokoll a JOIN ort o ON o.id = a.ort_id WHERE o.slug = 'it-profil' AND a.aktion = 'ortsprofil_geaendert'",
    );
    expect(prot.rows[0].n).toBe(2);
  });
});
