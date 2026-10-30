import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgPlakate } from '../src/infrastructure/postgres/plakat-repository.js';
import { PgTerminRepository } from '../src/infrastructure/postgres/termin-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Plakate (PostgreSQL, Issue #297)', () => {
  const db = new pg.Pool({ connectionString: url });
  const p = new PgPlakate(db);
  const repo = new PgTerminRepository(db);
  let terminId = '';
  let adminId = '';
  const bild = (n: number) => ({
    gross: new Uint8Array([n, 1]),
    klein: new Uint8Array([n]),
    breite: 800,
    hoehe: 1131,
  });
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-plakat'");
    await db.query("DELETE FROM admin WHERE name = 'IT Plakat'");
    await db.query("INSERT INTO ort(slug,name,landkreis) VALUES ('it-plakat','IT Plakat','IK')");
    adminId = (
      await db.query<{ id: string }>(
        "INSERT INTO admin(name, rolle) VALUES ('IT Plakat', 'redaktion') RETURNING id::text",
      )
    ).rows[0]!.id;
    terminId = (
      await db.query<{ id: string }>(
        "INSERT INTO termin(ort_id,datum,titel,kategorie,bestaetigt,quelle) SELECT id,'2027-09-18','IT Plakattanz','tanz',true,'Redaktion' FROM ort WHERE slug='it-plakat' RETURNING id",
      )
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-plakat'");
    await db.query("DELETE FROM admin WHERE name = 'IT Plakat'");
    await db.end();
  });
  it('Ort, speichern, ersetzen, laden, Stand am Termin, löschen mit Protokoll', async () => {
    expect(await p.ortVon(terminId)).toBe('it-plakat');
    expect(await p.ortVon('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect((await repo.finde(terminId))?.plakat).toBeNull();
    const v0 = (await repo.finde(terminId))?.version;
    await p.speichere(terminId, bild(1), adminId);
    await p.speichere(terminId, bild(2), adminId);
    expect(Array.from((await p.lade(terminId, 'gross'))!)).toEqual([2, 1]);
    expect(Array.from((await p.lade(terminId, 'klein'))!)).toEqual([2]);
    const t = await repo.finde(terminId);
    expect(t?.plakat).toMatch(/^\d+$/);
    expect(t?.version).not.toBe(v0);
    expect(await p.loesche(terminId, adminId)).toBe(true);
    expect(await p.loesche(terminId, adminId)).toBe(false);
    expect(await p.lade(terminId, 'gross')).toBeNull();
    const prot = await db.query<{ aktion: string }>(
      "SELECT aktion FROM aenderungsprotokoll WHERE details->>'id' = $1 ORDER BY id",
      [terminId],
    );
    expect(prot.rows.map((r) => r.aktion)).toEqual([
      'plakat_gespeichert',
      'plakat_gespeichert',
      'plakat_geloescht',
    ]);
  });
  it('Fehler rollt zurück (Termin unbekannt)', async () => {
    await expect(
      p.speichere('00000000-0000-4000-8000-000000000000', bild(3), adminId),
    ).rejects.toThrow();
  });
});
