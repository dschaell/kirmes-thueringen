import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { KalenderDatum, NeuerTermin } from '@kirmes/core';
import { VerwaltungMitGelesenemStand } from './verwaltung-mit-gelesenem-stand.js';
import { terminHerkunft } from '../src/infrastructure/postgres/termin-herkunft.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Ursprünglicher Terminersteller über PostgreSQL', () => {
  const db = new pg.Pool({ connectionString: url });
  let admin1: string;
  let admin2: string;
  let ortId: string;
  let linkId: string;
  const daten: NeuerTermin = {
    ortSlug: 'it-herkunft',
    landkreis: 'IK',
    datum: '2027-09-16' as KalenderDatum,
    beginn: '20:00',
    titel: 'IT Herkunft Tanz',
    veranstaltungsort: null,
    kategorie: 'party',
    bestaetigt: true,
    band: null,
    info: null,
    muttizettel: false,
  };
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug='it-herkunft'");
    ortId = (
      await db.query(
        "INSERT INTO ort(slug,name,landkreis) VALUES ('it-herkunft','IT Herkunft','IK') RETURNING id::text",
      )
    ).rows[0].id;
    admin1 = (
      await db.query(
        "INSERT INTO admin(name,rolle) VALUES ('IT Ersteller','admin') RETURNING id::text",
      )
    ).rows[0].id;
    admin2 = (
      await db.query(
        "INSERT INTO admin(name,rolle) VALUES ('IT Bearbeiter','redaktion') RETURNING id::text",
      )
    ).rows[0].id;
    linkId = (
      await db.query(
        'INSERT INTO bearbeitungslink(ort_id,token_hash,bezeichnung) VALUES ($1,$2,$3) RETURNING id::text',
        [ortId, randomBytes(32), 'IT Gesellschaft'],
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug='it-herkunft'");
    await db.query('DELETE FROM admin WHERE id = ANY($1::bigint[])', [[admin1, admin2]]);
    await db.end();
  });
  it('behält den Ersteller nach Bearbeiten, Bestätigen und abgewiesener Dublette', async () => {
    const verwaltung = new VerwaltungMitGelesenemStand(db);
    const berechtigt = {
      linkId: null,
      adminId: admin1,
      ortSlug: 'it-herkunft',
      landkreis: 'IK' as const,
      bezeichnung: 'Redaktion',
    };
    const t = await verwaltung.lege(daten, berechtigt);
    expect((await terminHerkunft(db, [t.id]))[t.id]).toMatchObject({
      name: 'IT Ersteller',
      weg: 'redaktion',
      geaendert: null,
    });
    await verwaltung.aendere(t.id, daten, { ...berechtigt, adminId: admin2 });
    await verwaltung.bestaetige(t.id, { ...berechtigt, adminId: admin2 });
    await expect(verwaltung.lege(daten, { ...berechtigt, adminId: admin2 })).rejects.toThrow(
      'bereits',
    );
    const h = (await terminHerkunft(db, [t.id]))[t.id];
    expect(h).toMatchObject({ name: 'IT Ersteller', weg: 'redaktion' });
    expect(h.angelegtAm).toBeTruthy();
    // zuletzt bearbeitet: der zweite Admin (Issue #181)
    expect(h.geaendert).toMatchObject({ name: 'IT Bearbeiter', weg: 'redaktion' });
    expect(h.geaendert?.am).toBeTruthy();
    // Bearbeitung über den Bearbeitungslink der Kirmesgesellschaft
    await db.query(
      "INSERT INTO aenderungsprotokoll(ort_id,link_id,aktion,details) VALUES ($1,$2,'termin_geaendert',$3)",
      [ortId, linkId, { id: t.id }],
    );
    expect((await terminHerkunft(db, [t.id]))[t.id]?.geaendert).toMatchObject({
      name: 'IT Gesellschaft',
      weg: 'bearbeitungslink',
    });
  });
  it('unterscheidet Bearbeitungslink, Vorschlag und fehlende Nachweise', async () => {
    const c = await db.connect();
    const ids: string[] = [];
    try {
      await c.query('BEGIN');
      for (const [index, weg] of ['link', 'vorschlag', 'alt'].entries()) {
        const id = (
          await c.query(
            "INSERT INTO termin(ort_id,datum,titel,kategorie) VALUES ($1,'2027-09-17',$2,'party') RETURNING id::text",
            [ortId, `IT Herkunft ${index}`],
          )
        ).rows[0].id;
        ids.push(id);
        if (weg !== 'alt')
          await c.query(
            "INSERT INTO aenderungsprotokoll(ort_id,admin_id,link_id,aktion,details) VALUES ($1,$2,$3,'termin_angelegt',$4)",
            [
              ortId,
              weg === 'vorschlag' ? admin1 : null,
              weg === 'link' ? linkId : null,
              weg === 'vorschlag' ? { id, vorschlag: 'it' } : { id },
            ],
          );
      }
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    // Ein späteres Upsert eines Altimports ist kein Nachweis für dessen ursprünglichen Ersteller.
    await db.query(
      "INSERT INTO aenderungsprotokoll(ort_id,admin_id,aktion,details,zeit) VALUES ($1,$2,'termin_angelegt',$3,now()+interval '1 second')",
      [ortId, admin2, { id: ids[2] }],
    );
    const h = await terminHerkunft(db, ids);
    expect(h[ids[0]]).toMatchObject({ name: 'IT Gesellschaft', weg: 'bearbeitungslink' });
    expect(h[ids[1]]).toMatchObject({ name: 'IT Ersteller', weg: 'vorschlag' });
    expect(h[ids[2]]).toEqual({ name: null, weg: 'unbekannt', angelegtAm: null, geaendert: null });
    expect(await terminHerkunft(db, [])).toEqual({});
  });
});
