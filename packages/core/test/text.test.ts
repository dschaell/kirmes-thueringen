import { describe, expect, it } from 'vitest';
import {
  bereinigeTitel,
  istKeinTermin,
  normalisiereOrtsname,
  validiereTermin,
} from '../src/index.js';

describe('bereinigeTitel', () => {
  it.each([
    ['Kirmestanz mit "Belconda"', 'Kirmestanz mit „Belconda“'],
    ['Kirmestanz mit "..."', 'Kirmestanz'],
    ['Kirmestanz mit der Band "..."', 'Kirmestanz'],
    ['Osterdisco mit ".."', 'Osterdisco'],
    ['Tanz in den Mai mit "Vincent', 'Tanz in den Mai mit „Vincent“'],
    [
      'Kirmesmusik von den mit "Gleichbergmusikanten"',
      'Kirmesmusik mit den „Gleichbergmusikanten“',
    ],
    ['Kinderkermse', 'Kinderkirmes'],
    ['Kirmestanz mit „Black & White ?????“', 'Kirmestanz mit „Black & White“'],
    ['Kirmestanz mit "???"', 'Kirmestanz'],
    ['Kirmes.... mit', 'Kirmes'],
    ['  Winterbeatz   2026 mit mehreren DJ´s; ', 'Winterbeatz 2026 mit mehreren DJ´s'],
    ['????', ''],
  ])('%s → %s', (roh, sauber) => expect(bereinigeTitel(roh)).toBe(sauber));

  it('lässt saubere Titel unverändert', () => {
    expect(bereinigeTitel('Kirmesbeerdigung')).toBe('Kirmesbeerdigung');
    expect(bereinigeTitel('Kirmestanz mit „Dynamic“')).toBe('Kirmestanz mit „Dynamic“');
  });
});

describe('istKeinTermin / validiereTermin', () => {
  it('erkennt Hinweise statt Veranstaltungen', () => {
    expect(istKeinTermin('keine Kirmes seit 2019')).toBe(true);
    expect(istKeinTermin('Kirmes')).toBe(false);
    const r = validiereTermin({
      ortSlug: 'x',
      landkreis: 'GTH',
      datum: '2026-10-18',
      titel: 'Keine Kirmes.???? !!!',
      kategorie: 'kirmes',
    });
    expect(!r.ok && r.error.map((f) => f.code)).toEqual(['KEIN_TERMIN']);
  });

  it('weist reine Platzhalter-Titel ab', () => {
    const r = validiereTermin({
      ortSlug: 'x',
      landkreis: 'GTH',
      datum: '2026-10-18',
      titel: '????',
      kategorie: 'kirmes',
    });
    expect(!r.ok && r.error.map((f) => f.code)).toEqual(['TITEL_LAENGE']);
  });
});

describe('normalisiereOrtsname', () => {
  it.each([
    ['EF-Stotternheim', 'Erfurt-Stotternheim'],
    ['Abtsroda/Poppenhausen', 'Abtsroda / Poppenhausen'],
    ['  Mühlberg ', 'Mühlberg'],
  ])('%s → %s', (roh, sauber) => expect(normalisiereOrtsname(roh)).toBe(sauber));
});
