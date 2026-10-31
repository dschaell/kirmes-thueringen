import { describe, expect, it } from 'vitest';
import { parseKoordinate, validiereFestplatz } from '../src/index.js';

describe('parseKoordinate', () => {
  it('akzeptiert Punkte in Thüringen und rundet auf 6 Stellen', () => {
    expect(parseKoordinate(50.8712345678, 10.8212345678)).toEqual({
      ok: true,
      value: { lat: 50.871235, lon: 10.821235 },
    });
  });
  it.each([
    [10.82, 50.87, 'vertauscht'],
    [52.52, 13.4, 'Berlin'],
    [Number.NaN, 10, 'NaN'],
    ['50.8', 10.8, 'Text'],
  ])('lehnt %s/%s ab (%s)', (lat, lon) => {
    const r = parseKoordinate(lat, lon);
    expect(!r.ok && r.error.code).toBe('KOORDINATE_UNGUELTIG');
  });
});

describe('validiereFestplatz', () => {
  it('trimmt den Namen und erlaubt leeren Namen (Standard-Festplatz)', () => {
    expect(validiereFestplatz({ name: '  ', lat: 50.9, lon: 11 })).toEqual({
      ok: true,
      value: { name: '', koordinate: { lat: 50.9, lon: 11 } },
    });
  });
  it('sammelt Fehler', () => {
    const r = validiereFestplatz({ name: 'x'.repeat(121), lat: 0, lon: 0 });
    expect(!r.ok && r.error.map((f) => f.code)).toEqual(['NAME_ZU_LANG', 'KOORDINATE_UNGUELTIG']);
  });
});

describe('Kartenausschnitt (bbox)', () => {
  it('liest „minLon,minLat,maxLon,maxLat“', async () => {
    const { parseKartenausschnitt } = await import('../src/index.js');
    expect(parseKartenausschnitt('10.5, 50.8, 11.0, 51.1')).toEqual({
      ok: true,
      value: { minLon: 10.5, minLat: 50.8, maxLon: 11, maxLat: 51.1 },
    });
  });
  it('lehnt Unsinn, vertauschte Werte, Riesenausschnitte und Orte außerhalb ab', async () => {
    const { parseKartenausschnitt } = await import('../src/index.js');
    for (const b of [
      '',
      '1,2,3',
      'a,b,c,d',
      '11,51,10,50',
      '0,40,9,49',
      '5,45,15,55',
      '13,52,14,53',
    ]) {
      const r = parseKartenausschnitt(b);
      expect(!r.ok && r.error.code, b).toBe('AUSSCHNITT_UNGUELTIG');
    }
  });
});
