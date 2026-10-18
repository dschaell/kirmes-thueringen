import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/api', () => ({
  findeOrt: vi.fn(async (slug: string) =>
    slug === 'alkersleben'
      ? { slug, name: 'Alkersleben', landkreis: 'IK', koordinate: null }
      : null,
  ),
}));
const { aboAuswahl } = await import('../src/lib/kalenderabo');
const p = (q: string) => new URLSearchParams(q);

describe('Kalender-Abo nach Kreis oder Ort (Issue #108)', () => {
  it('ganz Thüringen ohne Parameter', async () => {
    expect(await aboAuswahl(p(''))).toEqual({
      filter: {},
      name: 'Kirmeskalender Thüringen',
      query: '',
    });
  });
  it('Landkreis (Groß-/Kleinschreibung egal) und Ort', async () => {
    expect(await aboAuswahl(p('kreis=ik'))).toMatchObject({
      filter: { landkreis: ['IK'] },
      name: 'Kirmes im Ilm-Kreis',
      query: '?kreis=IK',
    });
    expect(await aboAuswahl(p('ort=alkersleben'))).toEqual({
      filter: { ort: 'alkersleben' },
      name: 'Kirmes in Alkersleben',
      query: '?ort=alkersleben',
    });
  });
  it('unbekannt oder Unsinn → null statt alles', async () => {
    expect(await aboAuswahl(p('kreis=XX'))).toBeNull();
    expect(await aboAuswahl(p('ort=gibtsnicht'))).toBeNull();
    expect(await aboAuswahl(p('ort=../etc'))).toBeNull();
  });
});
