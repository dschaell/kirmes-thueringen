import { describe, expect, it } from 'vitest';
import {
  VerwalteTermine,
  type Berechtigung,
  type KalenderDatum,
  type NeuerTermin,
  type Termin,
  type TerminFilter,
  type TerminRepository,
  type TerminVerwaltung,
} from '../src/index.js';

const b: Berechtigung = { linkId: '7', ortSlug: 'ulla', landkreis: 'WL', bezeichnung: 'KG Ulla' };
const ID = '6f1c0b6e-3d2a-4c1b-9f00-0123456789ab';

function aufbau() {
  const angelegt: NeuerTermin[] = [];
  let filter: TerminFilter | null = null;
  const verwaltung: TerminVerwaltung = {
    lege: async (t) => {
      angelegt.push(t);
      return {
        id: ID,
        ort: { slug: t.ortSlug, name: 'Ulla', landkreis: 'WL', koordinate: null },
        datum: t.datum,
        beginn: t.beginn,
        titel: t.titel,
        veranstaltungsort: t.veranstaltungsort,
        kategorie: t.kategorie,
        bestaetigt: t.bestaetigt,
        festplatz: null,
      } satisfies Termin;
    },
    aendere: async (id) => id === ID,
    bestaetige: async (id) => id === ID,
    loesche: async (id) => id === ID,
  };
  const termine: TerminRepository = {
    suche: async (f) => ((filter = f), { eintraege: [], gesamt: 0 }),
    finde: async () => null,
    speichere: async () => {
      throw new Error('nicht benötigt');
    },
  };
  const uc = new VerwalteTermine(
    { pruefe: async (t) => (t === 'gut' ? b : null) },
    verwaltung,
    termine,
    { heute: () => '2026-10-14' as KalenderDatum },
  );
  return { uc, angelegt, filter: () => filter };
}

describe('VerwalteTermine', () => {
  it('verweigert ungültige Links', async () => {
    const { uc } = aufbau();
    for (const r of [
      await uc.liste('x'),
      await uc.lege('x', { datum: '2026-10-18', titel: 'T' }),
      await uc.aendere('x', ID, { datum: '2026-10-18', titel: 'T' }),
      await uc.bestaetige('x', ID),
      await uc.loesche('x', ID),
    ]) {
      expect(r).toEqual({ ok: false, error: { code: 'NICHT_BERECHTIGT' } });
    }
  });

  it('listet den eigenen Ort von 30 Tagen zurück bis ein Jahr voraus', async () => {
    const { uc, filter } = aufbau();
    await uc.liste('gut');
    expect(filter()).toMatchObject({
      ortSlug: 'ulla',
      bereich: { von: '2026-09-14', bis: '2027-09-15' },
    });
  });

  it('legt Termine für den Ort des Links an, bestätigt und mit erkannter Kategorie', async () => {
    const { uc, angelegt } = aufbau();
    const r = await uc.lege('gut', {
      datum: '18.10.2026'.split('.').reverse().join('-'),
      titel: 'Kindertanz',
      beginn: '',
    });
    expect(r.ok).toBe(true);
    expect(angelegt[0]).toMatchObject({
      ortSlug: 'ulla',
      landkreis: 'WL',
      kategorie: 'kinder',
      bestaetigt: true,
      beginn: null,
    });
  });

  it('meldet Validierungsfehler und unbekannte Termine', async () => {
    const { uc } = aufbau();
    const kaputt = await uc.lege('gut', { datum: '2026-02-30', titel: '' });
    expect(!kaputt.ok && Array.isArray(kaputt.error)).toBe(true);
    expect(await uc.aendere('gut', 'kein-uuid', { datum: '2026-10-18', titel: 'T' })).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect((await uc.aendere('gut', ID, { datum: '2026-10-18', titel: 'T' })).ok).toBe(true);
    expect(await uc.bestaetige('gut', 'kein-uuid')).toEqual({ ok: true, value: false });
    expect(await uc.loesche('gut', ID)).toEqual({ ok: true, value: true });
  });
});
