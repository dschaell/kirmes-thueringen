import { describe, expect, it } from 'vitest';
import { wochenbildPng, wochenbildSvg } from '../src/lib/wochenbild';

const z = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    wann: 'Sa. 20:00',
    titel: `Tanz <${i}>`,
    ort: 'Ulla & Co',
  }));

describe('Wochenbild (Issue #308)', () => {
  it('Formate, Rest-Hinweis, maskiert', () => {
    const b = wochenbildSvg('30.10.–1.11.', z(9), 'beitrag');
    expect(b).toContain('height="1350"');
    expect(b).toContain('+ 3 weitere');
    expect(b).toContain('Tanz &lt;0&gt;');
    expect(b).toContain('Ulla &amp; Co');
    const s = wochenbildSvg('30.10.–1.11.', z(9), 'story');
    expect(s).toContain('height="1920"');
    expect(s).not.toContain('weitere');
    expect(wochenbildSvg('1.11.', [], 'beitrag')).toContain('noch nichts eingetragen');
  });
  it('rendert ein PNG', () => {
    const png = new Uint8Array(wochenbildPng('1.11.', z(2), 'story'));
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    // Rendern dauert auf geteilten CI-Rechnern mehrere Sekunden
  }, 30_000);
});
