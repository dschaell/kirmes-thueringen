import { describe, expect, it } from 'vitest';
import { kartePin } from '../src/lib/assistent/programm';

const form = (werte: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
};

describe('kartePin (Issue #446)', () => {
  it('übernimmt gültige Pin-Koordinaten als „Breite, Länge“', () => {
    expect(kartePin(form({ 'pinlat-0': '50.8712', 'pinlon-0': '10.8234' }), 0)).toBe(
      '50.8712, 10.8234',
    );
  });

  it('ohne Pin oder mit ungültigen Werten gilt das Link-Feld (null)', () => {
    expect(kartePin(form({}), 0)).toBeNull();
    expect(kartePin(form({ 'pinlat-0': '', 'pinlon-0': '' }), 0)).toBeNull();
    expect(kartePin(form({ 'pinlat-0': '50.8', 'pinlon-0': 'abc' }), 0)).toBeNull();
    expect(kartePin(form({ 'pinlat-0': '5e1', 'pinlon-0': '10.8' }), 0)).toBeNull();
  });

  it('liest nur die Zeile des eigenen Index', () => {
    expect(kartePin(form({ 'pinlat-1': '50.8', 'pinlon-1': '10.8' }), 0)).toBeNull();
  });
});
