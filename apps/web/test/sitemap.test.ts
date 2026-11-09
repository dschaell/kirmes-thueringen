import { describe, expect, it, vi } from 'vitest';

const beitraege = vi.fn(async (): Promise<object[]> => []);
vi.mock('../src/lib/api', () => ({
  listeOrte: vi.fn(async () => [
    { slug: 'elleben', name: 'Elleben', landkreis: 'IK', anzahlKommend: 1 },
    { slug: 'leer', name: 'Leer', landkreis: 'GTH', anzahlKommend: 0 },
  ]),
  alleTermine: vi.fn(async () => [
    {
      id: 'abc',
      geaendertAm: '2026-10-01T10:00:00.000Z',
      ort: { slug: 'elleben', name: 'Elleben', landkreis: 'IK' },
    },
  ]),
  holeBeitraege: beitraege,
}));
const { GET } = await import('../src/pages/sitemap.xml');
const sitemap = async () =>
  (await (GET as (ctx: object) => Promise<Response>)({ site: new URL('https://k.de') })).text();

describe('Sitemap nur mit Seiten, die Inhalt haben (Issue #416)', () => {
  it('leere Landkreise, Orte und Neuigkeiten fehlen – Google meldet sie sonst als Soft 404/noindex', async () => {
    const xml = await sitemap();
    expect(xml).toContain('<loc>https://k.de/kreise/ik</loc>');
    expect(xml).not.toContain('/kreise/gth');
    expect(xml).toContain('<loc>https://k.de/orte/elleben</loc>');
    expect(xml).not.toContain('/orte/leer');
    expect(xml).toContain('<loc>https://k.de/termin/abc</loc>');
    expect(xml).not.toContain('/neuigkeiten');
  });
  it('Neuigkeiten erscheinen, sobald es Beiträge gibt', async () => {
    beitraege.mockResolvedValueOnce([{ id: 'b1' }]);
    expect(await sitemap()).toContain('<loc>https://k.de/neuigkeiten</loc>');
  });
});
