import { erkenneKategorie } from '@kirmes/core';
import { describe, expect, it } from 'vitest';
import { wochenendVorlage } from '../src/lib/wochenende';

describe('Vorlage Kirmeswochenende (nach echter Kirmes, Issue #62)', () => {
  const v = wochenendVorlage('2026-10-16'); // Freitag

  it('läuft von Freitag bis Montag in der typischen Reihenfolge', () => {
    expect(v.map((z) => `${z.datum} ${z.beginn} ${z.titel}`)).toEqual([
      '2026-10-16 18:00 Kirmesgottesdienst',
      '2026-10-16 20:00 Kirmestanz',
      '2026-10-17 08:00 Ständchen',
      '2026-10-17 15:00 Kinderkirmes',
      '2026-10-17 20:00 Kirmesparty',
      '2026-10-18 10:00 Frühschoppen',
      '2026-10-19 10:00 Kirmesausklang',
    ]);
  });

  it('Kategorie vorbelegt – und passt zur automatischen Erkennung', () => {
    for (const z of v) expect(z.kategorie, z.titel).toBe(erkenneKategorie(z.titel));
  });

  it('Gottesdienst in der Kirche, Muttizettel bei der Party', () => {
    expect(v[0]?.veranstaltungsort).toBe('Kirche');
    expect(v.filter((z) => z.muttizettel).map((z) => z.titel)).toEqual(['Kirmesparty']);
  });
});
