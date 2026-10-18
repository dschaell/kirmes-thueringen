import { describe, expect, it } from 'vitest';
import {
  imNaechstenJahr,
  tageZwischen,
  verschiebeProgramm,
  voraussichtlich,
} from '../src/lib/vorjahr';

describe('Kirmes vom Vorjahr (Issue #106)', () => {
  it('gleicher n-ter Wochentag im Monat des Folgejahres', () => {
    expect(imNaechstenJahr('2026-10-16')).toBe('2027-10-15'); // 3. Freitag
    expect(imNaechstenJahr('2026-10-18')).toBe('2027-10-17'); // 3. Sonntag
    expect(imNaechstenJahr('2027-10-15')).toBe('2028-10-20'); // 3. Freitag
    expect(new Date('2028-10-20').getUTCDay()).toBe(5);
  });
  it('5. Wochentag, den es nicht gibt → letzter dieses Wochentags; Schaltjahr', () => {
    expect(imNaechstenJahr('2026-10-30')).toBe('2027-10-29'); // 5. Freitag → letzter Freitag
    expect(imNaechstenJahr('2027-02-26')).toBe('2028-02-25'); // letzter Freitag Feb im Schaltjahr
    expect(imNaechstenJahr('2028-02-29')).toBe('2029-02-27'); // 5. Dienstag → letzter Dienstag
  });
  it('verschiebt ein Programm als Ganzes, Abstände bleiben', () => {
    const p = verschiebeProgramm([
      { datum: '2026-10-18', titel: 'Frühschoppen' },
      { datum: '2026-10-16', titel: 'Kirmestanz' },
    ]);
    expect(p).toEqual([
      { datum: '2027-10-17', titel: 'Frühschoppen' },
      { datum: '2027-10-15', titel: 'Kirmestanz' },
    ]);
    expect(verschiebeProgramm([])).toEqual([]);
  });
  it('„voraussichtlich“ nur mit Monat und Jahr', () => {
    expect(voraussichtlich('2026-10-16')).toBe('Oktober 2027');
    expect(tageZwischen('2026-10-16', '2026-10-19')).toBe(3);
  });
});
