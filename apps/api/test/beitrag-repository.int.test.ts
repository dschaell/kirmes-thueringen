import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgBeitraege } from '../src/infrastructure/postgres/beitrag-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Beiträge mit Fotos (PostgreSQL, Issue #352)', () => {
  const db = new pg.Pool({ connectionString: url });
  const b = new PgBeitraege(db);
  let terminId = '';
  let adminId = '';
  const bild = (n: number) => ({
    gross: new Uint8Array([n, 1]),
    klein: new Uint8Array([n]),
    breite: 800,
    hoehe: 600,
  });
  beforeAll(async () => {
    await db.query(
      "DELETE FROM beitrag WHERE ort_id IN (SELECT id FROM ort WHERE slug LIKE 'it-beitrag%')",
    );
    await db.query("DELETE FROM ort WHERE slug LIKE 'it-beitrag%'");
    await db.query("DELETE FROM admin WHERE name = 'IT Beitrag'");
    await db.query(
      "INSERT INTO ort(slug,name,landkreis,kg_name) VALUES ('it-beitrag','IT Beitrag','IK','KG IT'), ('it-beitrag-2','IT Beitrag 2','IK',null)",
    );
    adminId = (
      await db.query<{ id: string }>(
        "INSERT INTO admin(name, rolle) VALUES ('IT Beitrag', 'redaktion') RETURNING id::text",
      )
    ).rows[0]!.id;
    terminId = (
      await db.query<{ id: string }>(
        "INSERT INTO termin(ort_id,datum,titel,kategorie,bestaetigt,quelle) SELECT id,'2027-09-18','IT Baumstellen','tradition',true,'Redaktion' FROM ort WHERE slug='it-beitrag' RETURNING id",
      )
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await db.query(
      "DELETE FROM beitrag WHERE ort_id IN (SELECT id FROM ort WHERE slug LIKE 'it-beitrag%')",
    );
    await db.query("DELETE FROM ort WHERE slug LIKE 'it-beitrag%'");
    await db.query("DELETE FROM admin WHERE name = 'IT Beitrag'");
    await db.end();
  });

  it('Entwurf, Fotos, veröffentlichen, Liste, Foto, löschen mit Protokoll', async () => {
    expect(await b.lege({ ortSlug: 'gibts-nicht', text: 'x', terminId: null }, adminId)).toBeNull();
    expect(await b.terminImOrt(terminId, 'it-beitrag')).toBe(true);
    expect(await b.terminImOrt(terminId, 'it-beitrag-2')).toBe(false);
    const id = (await b.lege({ ortSlug: 'it-beitrag', text: 'Baum steht', terminId }, adminId))!;
    expect(await b.stand(id)).toEqual({
      ortSlug: 'it-beitrag',
      veroeffentlicht: false,
      fotos: 0,
      text: 'Baum steht',
    });
    expect(await b.stand('00000000-0000-4000-8000-000000000000')).toBeNull();
    const f1 = await b.legeFoto(id, 1, bild(1), 'Der Baum');
    await b.legeFoto(id, 2, bild(2), '');
    expect(await b.fotosImOrt('it-beitrag')).toBe(2);
    // Entwürfe sind nicht öffentlich, ihre Fotos auch nicht
    expect(await b.liste({ ortSlug: 'it-beitrag', limit: 10 })).toEqual([]);
    expect(await b.foto(f1, 'gross')).toBeNull();
    const v = await b.veroeffentliche(id, adminId);
    expect(v).toMatchObject({
      id,
      ortSlug: 'it-beitrag',
      ortName: 'IT Beitrag',
      kgName: 'KG IT',
      text: 'Baum steht',
      termin: { id: terminId, titel: 'IT Baumstellen', datum: '2027-09-18' },
      fotos: [
        { id: f1, breite: 800, hoehe: 600, alt: 'Der Baum' },
        { breite: 800, hoehe: 600, alt: '' },
      ],
    });
    expect(v?.veroeffentlichtAm).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(await b.veroeffentliche(id, adminId)).toBeNull();
    expect(Array.from((await b.foto(f1, 'gross'))!)).toEqual([1, 1]);
    expect(Array.from((await b.foto(f1, 'klein'))!)).toEqual([1]);
    const zweiter = (await b.lege(
      { ortSlug: 'it-beitrag-2', text: 'Zweiter', terminId: null },
      adminId,
    ))!;
    const z = await b.veroeffentliche(zweiter, adminId);
    expect([z?.kgName, z?.termin, z?.fotos]).toEqual([null, null, []]);
    const alle = await b.liste({ limit: 50 });
    const unsere = alle.filter((x) => x.ortSlug.startsWith('it-beitrag')).map((x) => x.id);
    expect(unsere).toEqual([zweiter, id]);
    expect(
      (await b.liste({ vor: z!.veroeffentlichtAm!, ortSlug: 'it-beitrag', limit: 5 })).map(
        (x) => x.id,
      ),
    ).toEqual([id]);
    // Termin gelöscht: Beitrag bleibt, nur die Verknüpfung fällt weg
    await db.query('DELETE FROM termin WHERE id = $1', [terminId]);
    expect((await b.liste({ ortSlug: 'it-beitrag', limit: 5 }))[0]?.termin).toBeNull();
    expect(await b.loesche(id, adminId)).toBe(true);
    expect(await b.loesche(id, adminId)).toBe(false);
    expect(await b.foto(f1, 'gross')).toBeNull();
    const prot = await db.query<{ aktion: string }>(
      "SELECT aktion FROM aenderungsprotokoll WHERE details->>'id' = $1 ORDER BY id",
      [id],
    );
    expect(prot.rows.map((r) => r.aktion)).toEqual([
      'beitrag_veroeffentlicht',
      'beitrag_geloescht',
    ]);
  });

  it('Fehler rollt zurück', async () => {
    await expect(b.veroeffentliche('keine-uuid', adminId)).rejects.toThrow();
  });
});
