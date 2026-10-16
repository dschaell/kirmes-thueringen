/** Plätze durch die Redaktion – Standort per Google-Maps-Link oder Koordinaten (Issue #62). */
import { describe, expect, it } from 'vitest';
import {
  RedaktionsFestplaetze,
  type Berechtigung,
  type Festplatz,
  type Validierungsfehler,
} from '../src/index.js';

function aufbau(aufgeloest: string | null = null) {
  const gespeichert: [string, Festplatz, Berechtigung][] = [];
  const geloescht: [string, string, Berechtigung][] = [];
  const kurzlinks: string[] = [];
  const fp = new RedaktionsFestplaetze(
    {
      uebersicht: async (s) =>
        s === 'alkersleben' ? ({ ort: {}, festplaetze: [] } as never) : null,
      speichere: async (o, f, b) => void gespeichert.push([o, f, b]),
      loesche: async (o, n, b) => (geloescht.push([o, n, b]), n === 'Kirche'),
    },
    async (s) => (s === 'alkersleben' ? 'IK' : null),
    { aufloesen: async (u) => (kurzlinks.push(u), aufgeloest) },
  );
  return { fp, gespeichert, geloescht, kurzlinks };
}
const codes = (r: { ok: boolean; error?: unknown }) =>
  r.ok ? [] : (r.error as Validierungsfehler[]).map((f) => f.code);

describe('RedaktionsFestplaetze', () => {
  it('speichert mit Google-Maps-Link – Berechtigung der Redaktion mit Admin-ID', async () => {
    const { fp, gespeichert } = aufbau();
    const r = await fp.speichere(
      'alkersleben',
      {
        name: ' Kirche ',
        standort:
          'https://www.google.com/maps/place/Kirche/@50.8,11.0,15z/data=!3d50.847493!4d11.041234',
      },
      '7',
    );
    expect(r).toEqual({
      ok: true,
      value: { name: 'Kirche', koordinate: { lat: 50.847493, lon: 11.041234 } },
    });
    expect(gespeichert[0]?.[2]).toEqual({
      linkId: null,
      adminId: '7',
      ortSlug: 'alkersleben',
      landkreis: 'IK',
      bezeichnung: 'Redaktion',
    });
  });

  it('löst Kurzlinks auf; nicht auflösbar → verständlicher Fehler', async () => {
    const ok = aufbau('https://www.google.com/maps/place/X/data=!3d50.85!4d11.04');
    expect(
      (
        await ok.fp.speichere(
          'alkersleben',
          { name: '', standort: 'https://maps.app.goo.gl/Abc' },
          '1',
        )
      ).ok,
    ).toBe(true);
    expect(ok.kurzlinks).toEqual(['https://maps.app.goo.gl/Abc']);
    const nein = aufbau(null);
    expect(
      codes(
        await nein.fp.speichere(
          'alkersleben',
          { name: '', standort: 'https://maps.app.goo.gl/Abc' },
          '1',
        ),
      ),
    ).toEqual(['STANDORT']);
  });

  it('prüft Ort, Standort und Thüringen-Grenzen', async () => {
    const { fp, gespeichert } = aufbau();
    expect(
      codes(await fp.speichere('gibtsnicht', { name: 'X', standort: '50.8, 11.0' }, '1')),
    ).toEqual(['ORT_UNBEKANNT']);
    expect(
      codes(await fp.speichere('alkersleben', { name: 'X', standort: 'Festzelt' }, '1')),
    ).toEqual(['STANDORT']);
    // München liegt nicht in Thüringen
    expect(
      codes(await fp.speichere('alkersleben', { name: 'X', standort: '48.137, 11.575' }, '1'))
        .length,
    ).toBe(1);
    expect(gespeichert).toHaveLength(0);
  });

  it('löscht nur in bekannten Orten und zeigt die Übersicht', async () => {
    const { fp, geloescht } = aufbau();
    expect(await fp.loesche('alkersleben', ' Kirche ', '1')).toBe(true);
    expect(geloescht[0]?.[1]).toBe('Kirche');
    expect(await fp.loesche('gibtsnicht', 'Kirche', '1')).toBe(false);
    expect(await fp.uebersicht('alkersleben')).not.toBeNull();
  });
});
