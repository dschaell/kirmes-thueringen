/** Mittagstisch am Termin (Issue #66). */
import { describe, expect, it } from 'vitest';
import { preisAus, Redaktion, validiereSpeisen, type TerminVerwaltung } from '../src/index.js';

describe('preisAus', () => {
  it.each([
    ['9,50', 950],
    ['9.5', 950],
    ['9 €', 900],
    ['€ 12', 1200],
    ['12,00 EUR', 1200],
    ['0', 0],
    ['', null],
    ['  ', null],
  ])('„%s“ → %s', (t, c) => expect(preisAus(t)).toBe(c));
  it.each(['neun', '9,999', '-5', '1,2,3', '12345'])('„%s“ ist unlesbar', (t) =>
    expect(preisAus(t)).toBeUndefined(),
  );
});

describe('validiereSpeisen', () => {
  it('überspringt leere Zeilen, bereinigt Namen, behält die Reihenfolge', () => {
    expect(
      validiereSpeisen([
        { name: '  Rostbrätel   mit Brot ', preis: '7,50' },
        { name: '', preis: '' },
        { name: 'Kaffee und Kuchen', preis: '' },
      ]),
    ).toEqual({
      ok: true,
      value: [
        { name: 'Rostbrätel mit Brot', preisCent: 750 },
        { name: 'Kaffee und Kuchen', preisCent: null },
      ],
    });
  });
  it('meldet Fehler mit Zeilennummer', () => {
    const r = validiereSpeisen([
      { name: '', preis: '5' },
      { name: 'x'.repeat(121), preis: '' },
      { name: 'Klöße', preis: 'teuer' },
      { name: 'Hummer', preis: '1001' },
    ]);
    expect(!r.ok && r.error.map((f) => `${f.feld} ${f.code}`)).toEqual([
      'speise1.name PFLICHT',
      'speise2.name NAME_LAENGE',
      'speise3.preis PREIS',
      'speise4.preis PREIS',
    ]);
  });
  it('höchstens 20 Gerichte', () => {
    const r = validiereSpeisen(
      Array.from({ length: 21 }, (_, i) => ({ name: `G${i}`, preis: '1' })),
    );
    expect(!r.ok && r.error[0]?.code).toBe('ZU_VIELE');
  });
});

describe('Redaktion.setzeSpeisen', () => {
  function aufbau() {
    const gesetzt: unknown[] = [];
    const r = new Redaktion(
      {} as never,
      {} as never,
      async (slug) => (slug === 'alkersleben' ? 'IK' : null),
      {
        setzeSpeisen: async (id, speisen) => (gesetzt.push([id, speisen]), id === 'da'),
      } as Partial<TerminVerwaltung> as TerminVerwaltung,
    );
    return { r, gesetzt };
  }
  it('prüft, speichert und meldet unbekannte Termine/Orte', async () => {
    const { r, gesetzt } = aufbau();
    expect(
      await r.setzeSpeisen('da', 'alkersleben', [{ name: 'Erbsensuppe', preis: '4,50' }], '1'),
    ).toEqual({
      ok: true,
      value: [{ name: 'Erbsensuppe', preisCent: 450 }],
    });
    expect(gesetzt).toHaveLength(1);
    expect(await r.setzeSpeisen('weg', 'alkersleben', [], '1')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect(await r.setzeSpeisen('da', 'gibtsnicht', [], '1')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect((await r.setzeSpeisen('da', 'alkersleben', [{ name: '', preis: '1' }], '1')).ok).toBe(
      false,
    );
    expect(gesetzt).toHaveLength(2); // ungültige Eingaben erreichen das Repository nie
  });
});
