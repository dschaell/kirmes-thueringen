import { describe, expect, it } from 'vitest';
import {
  erstelleDatumsbereich,
  istHerbstKirmes,
  parseDatum,
  parseLandkreis,
  plusTage,
  validiereTermin,
  type KalenderDatum,
  type TerminEingabe,
} from '../src/index.js';

const d = (s: string) => s as KalenderDatum;

describe('parseDatum', () => {
  it.each(['2026-10-18', '2028-02-29'])('akzeptiert %s', (s) => {
    expect(parseDatum(s).ok).toBe(true);
  });
  it.each(['2026-02-29', '2026-13-01', '18.10.2026', '', '2026-10-18T00:00'])(
    'lehnt %s ab',
    (s) => {
      const r = parseDatum(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('DATUM_UNGUELTIG');
    },
  );
});

describe('erstelleDatumsbereich', () => {
  it('akzeptiert gleiche Tage', () => {
    expect(erstelleDatumsbereich(d('2026-10-18'), d('2026-10-18')).ok).toBe(true);
  });
  it('lehnt umgekehrten Bereich ab', () => {
    const r = erstelleDatumsbereich(d('2026-10-18'), d('2026-10-17'));
    expect(!r.ok && r.error.code).toBe('BEREICH_UMGEKEHRT');
  });
  it('erlaubt zwei Jahre (Suche ±1 Jahr), lehnt mehr ab', () => {
    expect(erstelleDatumsbereich(d('2026-01-01'), plusTage(d('2026-01-01'), 731)).ok).toBe(true);
    const r = erstelleDatumsbereich(d('2026-01-01'), plusTage(d('2026-01-01'), 732));
    expect(!r.ok && r.error.code).toBe('BEREICH_ZU_GROSS');
  });
});

describe('parseLandkreis', () => {
  it('normalisiert Groß-/Kleinschreibung', () => {
    expect(parseLandkreis(' gth ')).toEqual({ ok: true, value: 'GTH' });
    expect(parseLandkreis('söm')).toEqual({ ok: true, value: 'SÖM' });
  });
  it('lehnt nicht-thüringische Kreise ab', () => {
    expect(parseLandkreis('M').ok).toBe(false);
    expect(parseLandkreis('toString').ok).toBe(false);
  });
});

describe('istHerbstKirmes', () => {
  it.each([
    ['2026-08-31', false],
    ['2026-09-01', true],
    ['2026-11-30', true],
    ['2026-12-01', false],
  ])('%s → %s', (s, erwartet) => expect(istHerbstKirmes(d(s))).toBe(erwartet));
});

describe('validiereTermin', () => {
  const basis: TerminEingabe = {
    ortSlug: 'muehlberg',
    landkreis: 'GTH',
    datum: '2026-10-18',
    beginn: '20:00',
    titel: '  Kirmestanz mit „Belconda“ ',
    kategorie: 'party',
  };

  it('liefert normalisierten Termin ohne Hinweise im Herbst', () => {
    const r = validiereTermin(basis);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.termin.titel).toBe('Kirmestanz mit „Belconda“');
      expect(r.value.termin.bestaetigt).toBe(false);
      expect(r.value.hinweise).toEqual([]);
    }
  });

  it('warnt bei Kirmes außerhalb des Herbstes, lehnt aber nicht ab', () => {
    const r = validiereTermin({ ...basis, datum: '2026-05-02' });
    expect(r.ok && r.value.hinweise.map((h) => h.code)).toEqual(['KIRMES_AUSSERHALB_HERBST']);
  });

  it('warnt nicht bei Kindertanz im Frühjahr', () => {
    const r = validiereTermin({
      ...basis,
      titel: 'Kindertanz',
      datum: '2026-05-02',
      kategorie: 'familie',
    });
    expect(r.ok && r.value.hinweise).toEqual([]);
  });

  it('sammelt alle Fehler auf einmal', () => {
    const r = validiereTermin({
      ortSlug: 'Mühl berg',
      landkreis: 'XX',
      datum: '2026-02-30',
      beginn: '25:00',
      titel: ' ',
      kategorie: 'zirkus',
    });
    expect(!r.ok && r.error.map((f) => f.code).sort()).toEqual(
      [
        'DATUM_UNGUELTIG',
        'KATEGORIE_UNBEKANNT',
        'LANDKREIS_UNBEKANNT',
        'SLUG_UNGUELTIG',
        'TITEL_LAENGE',
        'UHRZEIT_UNGUELTIG',
      ].sort(),
    );
  });

  it('setzt leeren Veranstaltungsort auf null', () => {
    const r = validiereTermin({ ...basis, veranstaltungsort: '   ', beginn: null });
    expect(r.ok && r.value.termin.veranstaltungsort).toBeNull();
    expect(r.ok && r.value.termin.beginn).toBeNull();
  });
});
