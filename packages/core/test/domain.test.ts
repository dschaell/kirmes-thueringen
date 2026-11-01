import { describe, expect, it } from 'vitest';
import {
  erstelleDatumsbereich,
  istHerbstKirmes,
  parseDatum,
  parseLandkreis,
  plusTage,
  validiereTermin,
  eintrittAus,
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

describe('Veranstalter und Eintritt (Issue #278)', () => {
  const basis = {
    ortSlug: 'alkersleben',
    landkreis: 'IK',
    datum: '2027-09-17',
    titel: 'Kirmestanz',
    kategorie: 'tanz',
  };
  it('Eintritt: Betrag, „frei“, leer; unlesbar oder über 1000 € ist ein Fehler', () => {
    expect(eintrittAus('8')).toBe(800);
    expect(eintrittAus('7,50 €')).toBe(750);
    expect(eintrittAus('Eintritt frei')).toBe(0);
    expect(eintrittAus('kostenlos')).toBe(0);
    expect(eintrittAus(' ')).toBeNull();
    expect(eintrittAus(null)).toBeNull();
    expect(eintrittAus('acht')).toBeUndefined();
    expect(eintrittAus('1001')).toBeUndefined();
    const r = validiereTermin({ ...basis, eintritt: '5', veranstalter: '  Feuerwehr   Muster ' });
    expect(r.ok && r.value.termin).toMatchObject({
      eintrittCent: 500,
      veranstalter: 'Feuerwehr Muster',
    });
    const leer = validiereTermin({ ...basis, eintritt: '', veranstalter: '' });
    expect(leer.ok && leer.value.termin).toMatchObject({ eintrittCent: null, veranstalter: null });
    const falsch = validiereTermin({ ...basis, eintritt: 'viel', veranstalter: 'x'.repeat(201) });
    expect(!falsch.ok && falsch.error.map((f) => f.code)).toEqual([
      'VERANSTALTER_LAENGE',
      'EINTRITT_UNGUELTIG',
    ]);
  });
  it('nicht mitgeschickt → Felder fehlen (gespeicherter Wert bleibt)', () => {
    const r = validiereTermin(basis);
    expect(r.ok && 'veranstalter' in r.value.termin).toBe(false);
    expect(r.ok && 'eintrittCent' in r.value.termin).toBe(false);
  });
});

describe('Endzeit (Issue #286)', () => {
  const basis = {
    ortSlug: 'alkersleben',
    landkreis: 'IK',
    datum: '2027-09-17',
    beginn: '10:00',
    titel: 'Kartenvorverkauf',
    kategorie: 'sonstiges',
  };
  const codes = (x: object) => {
    const r = validiereTermin({ ...basis, ...x });
    return r.ok ? [] : r.error.map((f) => f.code);
  };
  it('speichert Endzeit, leer = keine, nicht mitgeschickt = Feld fehlt', () => {
    const r = validiereTermin({ ...basis, ende: ' 12:00 ' });
    expect(r.ok && r.value.termin.ende).toBe('12:00');
    const leer = validiereTermin({ ...basis, ende: '' });
    expect(leer.ok && leer.value.termin.ende).toBeNull();
    const ohne = validiereTermin(basis);
    expect(ohne.ok && 'ende' in ohne.value.termin).toBe(false);
    // vor Beginn = nach Mitternacht
    expect(codes({ beginn: '20:00', ende: '02:00' })).toEqual([]);
  });
  it('Fehler: Format, ohne Beginn, gleich Beginn', () => {
    expect(codes({ ende: '25:00' })).toEqual(['UHRZEIT_UNGUELTIG']);
    expect(codes({ beginn: null, ende: '12:00' })).toEqual(['ENDE_OHNE_BEGINN']);
    expect(codes({ ende: '10:00' })).toEqual(['ENDE_GLEICH_BEGINN']);
  });
});

describe('Pfarrer/in beim Gottesdienst (Issue #175)', () => {
  const basis = {
    ortSlug: 'alkersleben',
    landkreis: 'IK',
    datum: '2027-09-17',
    titel: 'Kirmesgottesdienst',
    kategorie: 'tradition',
  };
  it('bereinigt Leerraum, leer → null, max. 120 Zeichen', () => {
    const r = validiereTermin({ ...basis, pfarrer: '  Pfarrerin   Anna  Muster ' });
    expect(r.ok && r.value.termin.pfarrer).toBe('Pfarrerin Anna Muster');
    const leer = validiereTermin({ ...basis, pfarrer: '   ' });
    expect(leer.ok && leer.value.termin.pfarrer).toBeNull();
    // nicht mitgeschickt = gespeicherten Wert behalten (Issue #378)
    const ohne = validiereTermin({ ...basis, pfarrer: undefined });
    expect(ohne.ok && ohne.value.termin.pfarrer).toBeUndefined();
    const lang = validiereTermin({ ...basis, pfarrer: 'x'.repeat(121) });
    expect(!lang.ok && lang.error.map((f) => f.code)).toEqual(['PFARRER_LAENGE']);
  });
});
