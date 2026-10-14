import { describe, expect, it } from 'vitest';
import {
  parseKoordinate,
  validiereFestplatz,
  VerwalteFestplaetze,
  type Berechtigung,
  type Festplatz,
  type FestplatzRepository,
} from '../src/index.js';

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

describe('VerwalteFestplaetze', () => {
  const berechtigung: Berechtigung = {
    linkId: '1',
    ortSlug: 'muehlberg',
    landkreis: 'GTH',
    bezeichnung: 'KG Mühlberg',
  };
  const gespeichert: { ort: string; f: Festplatz; durch: Berechtigung }[] = [];
  const repo: FestplatzRepository = {
    uebersicht: async (slug) =>
      slug === 'muehlberg'
        ? {
            ort: { slug, name: 'Mühlberg', landkreis: 'GTH', koordinate: null },
            festplaetze: [],
            veranstaltungsorte: ['Festzelt'],
          }
        : null,
    speichere: async (ort, f, durch) => {
      gespeichert.push({ ort, f, durch });
    },
    loesche: async (_ort, name) => name === 'Festzelt',
  };
  const uc = new VerwalteFestplaetze(
    { pruefe: async (t) => (t === 'gueltig' ? berechtigung : null) },
    repo,
  );

  it('verweigert ungültige Links für jede Aktion', async () => {
    expect(await uc.uebersicht('falsch')).toEqual({
      ok: false,
      error: { code: 'NICHT_BERECHTIGT' },
    });
    expect((await uc.speichere('falsch', { name: 'x', lat: 50.9, lon: 11 })).ok).toBe(false);
    expect((await uc.loesche('falsch', 'x')).ok).toBe(false);
    expect(gespeichert).toHaveLength(0);
  });

  it('speichert nur für den Ort des Links und mit Protokoll-Berechtigung', async () => {
    const r = await uc.speichere('gueltig', { name: ' Festzelt ', lat: 50.87, lon: 10.82 });
    expect(r.ok).toBe(true);
    expect(gespeichert[0]).toEqual({
      ort: 'muehlberg',
      f: { name: 'Festzelt', koordinate: { lat: 50.87, lon: 10.82 } },
      durch: berechtigung,
    });
  });

  it('gibt Validierungsfehler zurück', async () => {
    const r = await uc.speichere('gueltig', { name: 'Festzelt', lat: 48.1, lon: 11.5 });
    expect(!r.ok && Array.isArray(r.error)).toBe(true);
  });

  it('liefert Übersicht mit Bezeichnung und löscht', async () => {
    const u = await uc.uebersicht('gueltig');
    expect(u.ok && u.value.bezeichnung).toBe('KG Mühlberg');
    expect(await uc.loesche('gueltig', ' Festzelt ')).toEqual({ ok: true, value: true });
  });
});
