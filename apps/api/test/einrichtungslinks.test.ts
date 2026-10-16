/** Einrichtungslinks im Arbeitsspeicher (Issue #48). */
import { describe, expect, it } from 'vitest';
import { SpeicherEinrichtungslinks } from '../src/infrastructure/einrichtungslinks.js';

describe('SpeicherEinrichtungslinks', () => {
  it('gültig bis zum Verbrauch, danach nicht mehr', () => {
    const s = new SpeicherEinrichtungslinks();
    const l = s.lege();
    expect(l).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.gueltig(l)).toBe(true);
    expect(s.gueltig(l)).toBe(true); // mehrfach prüfbar (Neuladen)
    s.verbrauche(l);
    expect(s.gueltig(l)).toBe(false);
    expect(s.gueltig('unbekannt')).toBe(false);
  });

  it('läuft nach der Gültigkeit ab', () => {
    let t = 0;
    const s = new SpeicherEinrichtungslinks(1000, 20, () => t);
    const l = s.lege();
    t = 1000;
    expect(s.gueltig(l)).toBe(true);
    t = 1001;
    expect(s.gueltig(l)).toBe(false);
  });

  it('räumt abgelaufene Links auf und verdrängt bei Überfüllung den ältesten', () => {
    let t = 0;
    const s = new SpeicherEinrichtungslinks(100, 2, () => t);
    const a = s.lege();
    const b = s.lege();
    const c = s.lege(); // verdrängt a
    expect(s.gueltig(a)).toBe(false);
    expect(s.gueltig(b)).toBe(true);
    t = 500;
    s.lege(); // b und c sind abgelaufen und werden entfernt
    expect(s.gueltig(c)).toBe(false);
  });
});
