/** Ganze Kirmes eines Ortes auf einmal bearbeiten (Issue #65). */
import { describe, expect, it } from 'vitest';
import { Redaktion, type NeuerTermin, type TerminVerwaltung } from '../src/index.js';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

function aufbau(vorhanden = [ID1, ID2]) {
  const aufrufe: { aenderungen: { id: string; termin: NeuerTermin }[]; loeschen: string[] }[] = [];
  const termine = {
    aendereAlle: async (aenderungen, loeschen) => {
      aufrufe.push({ aenderungen, loeschen });
      return [...aenderungen.map((a) => a.id), ...loeschen].every((id) => vorhanden.includes(id));
    },
  } as Partial<TerminVerwaltung> as TerminVerwaltung;
  const r = new Redaktion(
    {} as never,
    {} as never,
    async (slug) => (slug === 'alkersleben' ? 'IK' : null),
    termine,
    {} as never,
    { neuesToken: () => 'x' },
  );
  return { r, aufrufe };
}

const zeile = (id: string, extra = {}) => ({
  id,
  datum: '2026-10-16',
  beginn: '18:00',
  titel: 'Kirmesgottesdienst',
  veranstaltungsort: 'Kirche',
  kategorie: null,
  bestaetigt: true,
  band: null,
  info: null,
  muttizettel: false,
  ...extra,
});

describe('Redaktion.bearbeiteKirmes', () => {
  it('ändert und löscht in einem Aufruf, erkennt die Art aus dem Titel', async () => {
    const { r, aufrufe } = aufbau();
    const e = await r.bearbeiteKirmes(
      'alkersleben',
      [zeile(ID1), zeile(ID2, { loeschen: true })],
      '7',
    );
    expect(e.ok).toBe(true);
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]!.aenderungen).toEqual([
      {
        id: ID1,
        termin: expect.objectContaining({ titel: 'Kirmesgottesdienst', kategorie: 'tradition' }),
      },
    ]);
    expect(aufrufe[0]!.loeschen).toEqual([ID2]);
  });

  it('prüft alle Zeilen vorher – ein Fehler, und nichts wird gespeichert', async () => {
    const { r, aufrufe } = aufbau();
    const e = await r.bearbeiteKirmes('alkersleben', [zeile(ID1), zeile(ID2, { titel: '' })], '7');
    expect(e.ok).toBe(false);
    expect(aufrufe).toHaveLength(0);
  });

  it('gelöschte Zeilen werden nicht geprüft (auch mit leerem Titel)', async () => {
    const { r } = aufbau();
    expect(
      (await r.bearbeiteKirmes('alkersleben', [zeile(ID1, { titel: '', loeschen: true })], '7')).ok,
    ).toBe(true);
  });

  it('unbekannter Ort oder fremder Termin → NICHT_GEFUNDEN', async () => {
    expect(await aufbau().r.bearbeiteKirmes('gibtsnicht', [zeile(ID1)], '7')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect(
      await aufbau([ID1]).r.bearbeiteKirmes(
        'alkersleben',
        [zeile(ID1), zeile(ID2, { titel: 'Kirmestanz' })],
        '7',
      ),
    ).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
  });
});
