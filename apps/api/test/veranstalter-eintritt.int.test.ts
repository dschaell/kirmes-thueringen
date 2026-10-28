import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { KalenderDatum, NeuerTermin } from '@kirmes/core';
import { PgTerminVerwaltung } from '../src/infrastructure/postgres/termin-verwaltung.js';
import { PgTerminRepository } from '../src/infrastructure/postgres/termin-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Veranstalter und Eintritt (#278)', () => {
  const db = new pg.Pool({ connectionString: url });
  const v = new PgTerminVerwaltung(db);
  const repo = new PgTerminRepository(db);
  const durch = { linkId: null, ortSlug: 'it-eintritt', landkreis: 'IK', bezeichnung: 'Test' };
  const t = (x: Partial<NeuerTermin> = {}): NeuerTermin => ({
    ortSlug: durch.ortSlug,
    landkreis: 'IK',
    datum: '2027-09-18' as KalenderDatum,
    beginn: '20:00',
    titel: 'IT Kirmestanz',
    veranstaltungsort: null,
    kategorie: 'tanz',
    bestaetigt: true,
    band: null,
    info: null,
    muttizettel: false,
    ...x,
  });
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-eintritt'");
    await db.query(
      "INSERT INTO ort(slug,name,landkreis,kg_name) VALUES ('it-eintritt','IT Eintritt','IK','IT Kirmesverein e.V.')",
    );
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-eintritt'");
    await db.end();
  });
  it('speichert, liefert Namen der Kirmesgesellschaft mit, behält Werte bei Formularen ohne Felder', async () => {
    const a = await v.lege(t({ veranstalter: 'IT Feuerwehr', eintrittCent: 800 }), durch);
    expect(a).toMatchObject({ veranstalter: 'IT Feuerwehr', eintrittCent: 800 });
    expect(await repo.finde(a.id)).toMatchObject({
      veranstalter: 'IT Feuerwehr',
      eintrittCent: 800,
      ort: { kgName: 'IT Kirmesverein e.V.' },
    });
    // Formular ohne die neuen Felder (z. B. Sammelbearbeitung): nichts geht verloren
    const gelesen = await repo.finde(a.id);
    expect(
      await v.aendere(a.id, t({ titel: 'IT Kirmestanz neu', version: gelesen?.version }), durch),
    ).toBe(true);
    expect(await repo.finde(a.id)).toMatchObject({
      titel: 'IT Kirmestanz neu',
      veranstalter: 'IT Feuerwehr',
      eintrittCent: 800,
    });
    // ausdrücklich geleert bzw. frei
    const v2 = (await repo.finde(a.id))?.version;
    expect(
      await v.aendere(a.id, t({ veranstalter: null, eintrittCent: 0, version: v2 }), durch),
    ).toBe(true);
    expect(await repo.finde(a.id)).toMatchObject({ veranstalter: null, eintrittCent: 0 });
    const ohne = await repo.speichere(t({ titel: 'IT Frühschoppen', kategorie: 'fruehschoppen' }));
    expect(await repo.finde(ohne.id)).toMatchObject({ veranstalter: null, eintrittCent: null });
  });
  it('Endzeit (#286): anlegen, behalten ohne Feld, ohne Beginn weg', async () => {
    const a = await v.lege(t({ beginn: '10:00', ende: '12:00', titel: 'IT Vorverkauf' }), durch);
    expect(a.ende).toBe('12:00');
    expect((await repo.finde(a.id))?.ende).toBe('12:00');
    const v1 = (await repo.finde(a.id))?.version;
    expect(await v.aendere(a.id, t({ beginn: '10:00', titel: 'IT VV', version: v1 }), durch)).toBe(
      true,
    );
    expect((await repo.finde(a.id))?.ende).toBe('12:00');
    const v2 = (await repo.finde(a.id))?.version;
    expect(await v.aendere(a.id, t({ beginn: null, titel: 'IT VV', version: v2 }), durch)).toBe(
      true,
    );
    expect((await repo.finde(a.id))?.ende).toBeNull();
    const r = await repo.speichere(t({ titel: 'IT Tanz', ende: '02:00' }));
    expect((await repo.finde(r.id))?.ende).toBe('02:00');
    expect((await repo.speichere(t({ titel: 'IT Ohne' }))).ende).toBeNull();
  });
});
