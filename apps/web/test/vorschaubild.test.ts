import { describe, expect, it } from 'vitest';
import { umbrechen, vorschauPng, vorschauSvg } from '../src/lib/vorschaubild';

describe('Vorschaubild je Termin (Issue #110)', () => {
  it('bricht nach Wörtern um und kürzt mit …', () => {
    expect(umbrechen('Traditioneller Kirmesgottesdienst mit Posaunenchor', 24, 2)).toEqual([
      'Traditioneller',
      'Kirmesgottesdienst mit…',
    ]);
    expect(umbrechen('Kirmestanz', 24, 2)).toEqual(['Kirmestanz']);
    expect(umbrechen('Supercalifragilisticexpialigetisch', 10, 2)).toEqual(['Supercali…']);
  });
  it('maskiert Texte für XML', () => {
    const svg = vorschauSvg({ titel: '<script>&"', wann: 'Fr', wo: "O'Dorf", art: 'Kindertanz' });
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).toContain('O&apos;Dorf');
    expect(svg).not.toContain('<script>');
  });
  it('rendert ein PNG 1200×630', () => {
    const png = new DataView(
      vorschauPng({
        titel: 'Kirmestanz',
        wann: 'Sa, 24. Oktober',
        wo: 'Alkersleben',
        art: 'Kirmestanz/Kirmesdisco',
      }),
    );
    expect(png.getUint32(0)).toBe(0x89504e47);
    expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630]);
    // Rendern dauert auf geteilten CI-Rechnern mehrere Sekunden
  }, 30_000);
});
