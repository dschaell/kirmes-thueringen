/** Einrichtungslinks im Arbeitsspeicher (Issue #48). */
import { describe, expect, it } from 'vitest';
import { SpeicherEinrichtungslinks } from '../src/infrastructure/einrichtungslinks.js';

describe('SpeicherEinrichtungslinks', () => {
  it('liefert das Geheimnis bis zum Verbrauch, danach nicht mehr', () => {
    const s = new SpeicherEinrichtungslinks();
    const l = s.lege('GEHEIM');
    expect(l).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.finde(l)).toEqual({ totpGeheimnis: 'GEHEIM' });
    expect(s.finde(l)).toEqual({ totpGeheimnis: 'GEHEIM' }); // mehrfach lesbar (Neuladen)
    s.verbrauche(l);
    expect(s.finde(l)).toBeNull();
    expect(s.finde('unbekannt')).toBeNull();
  });

  it('läuft nach der Gültigkeit ab', () => {
    let t = 0;
    const s = new SpeicherEinrichtungslinks(1000, 20, () => t);
    const l = s.lege('G');
    t = 1000;
    expect(s.finde(l)).not.toBeNull();
    t = 1001;
    expect(s.finde(l)).toBeNull();
  });

  it('räumt abgelaufene Links auf und verdrängt bei Überfüllung den ältesten', () => {
    let t = 0;
    const s = new SpeicherEinrichtungslinks(100, 2, () => t);
    const a = s.lege('A');
    const b = s.lege('B');
    const c = s.lege('C'); // verdrängt a
    expect(s.finde(a)).toBeNull();
    expect(s.finde(b)).not.toBeNull();
    t = 500;
    s.lege('D'); // b und c sind abgelaufen und werden entfernt
    expect(s.finde(c)).toBeNull();
  });
});
