import { describe, expect, it } from 'vitest';
import {
  bandsAus,
  MAX_VERANSTALTUNGEN,
  validiereAlle,
  validiereTermin,
  type TerminEingabe,
} from '../src/index.js';

const basis = { ortSlug: 'muehlberg', landkreis: 'GTH', kategorie: 'kirmes' };
const pruefe = (e: Partial<TerminEingabe>) =>
  validiereTermin({ ...basis, datum: '', titel: '', ...e });

describe('Band und Hinweise am Termin', () => {
  it('bereinigt die Band, behält Apostrophe und übernimmt Hinweise', () => {
    const r = pruefe({
      datum: '2026-10-17',
      titel: 'Kirmestanz',
      band: " „Sethi's  Faction“ ",
      info: ' Eintritt 8 € ',
    });
    expect(r.ok && r.value.termin).toMatchObject({ band: "Sethi's Faction", info: 'Eintritt 8 €' });
  });
  it('mehrere Bands/DJs: Komma oder Semikolon, einheitlich gespeichert (Issue #324)', () => {
    const r = pruefe({
      datum: '2026-10-17',
      titel: 'Kirmestanz',
      band: ' X-traWild ;DJ  Aybee,, „Pfundskerle“, x-trawild ',
    });
    expect(r.ok && r.value.termin.band).toBe('X-traWild, DJ Aybee, Pfundskerle');
    expect(bandsAus('Pfundskerle & Friends')).toEqual(['Pfundskerle & Friends']);
    expect(bandsAus(null)).toEqual([]);
    expect(bandsAus(' , ; ')).toEqual([]);
  });
  it('leere Felder werden null, zu lange abgelehnt', () => {
    expect(pruefe({ datum: '2026-10-17', titel: 'Kirmes', band: '  ', info: '' }).ok && true).toBe(
      true,
    );
    const r = pruefe({
      datum: '2026-10-17',
      titel: 'Kirmes',
      band: 'x'.repeat(121),
      info: 'y'.repeat(501),
    });
    expect(!r.ok && r.error.map((f) => f.code)).toEqual(['BAND_LAENGE', 'INFO_LAENGE']);
  });
});

describe('validiereAlle (Kirmeswochenende)', () => {
  const wochenende = [
    { datum: '2026-10-16', titel: 'Kirmesdisco', band: 'DJ X' },
    { datum: '2026-10-17', titel: 'Kirmestanz', band: 'Belconda' },
    { datum: '2026-10-18', titel: 'Kindertanz' },
    { datum: '2026-10-18', titel: 'Kirmestanz', band: 'Excite' },
  ];

  it('nimmt mehrere Veranstaltungen pro Tag an', () => {
    const r = validiereAlle(wochenende, pruefe);
    expect(r.ok && r.value.termine.map((t) => `${t.datum} ${t.titel}`)).toEqual([
      '2026-10-16 Kirmesdisco',
      '2026-10-17 Kirmestanz',
      '2026-10-18 Kindertanz',
      '2026-10-18 Kirmestanz',
    ]);
  });

  it('meldet Fehler mit Zeilennummer – und speichert dann gar nichts', () => {
    const r = validiereAlle([...wochenende, { datum: '2026-02-30', titel: '' }], pruefe);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.map((f) => f.feld)).toEqual(['zeile5.datum', 'zeile5.titel']);
    expect(!r.ok && r.error[0]?.meldung).toMatch(/^Zeile 5: /);
  });

  it('meldet ein leeres Datum verständlich', () => {
    const r = validiereAlle([{ datum: '', titel: 'Kirmestanz' }], pruefe);
    expect(!r.ok && r.error[0]?.meldung).toBe('Zeile 1: Datum fehlt.');
  });

  it('erkennt doppelte Veranstaltungen (gleicher Tag, gleicher Titel)', () => {
    const r = validiereAlle([...wochenende, { datum: '2026-10-17', titel: 'Kirmestanz' }], pruefe);
    expect(!r.ok && r.error[0]).toMatchObject({ code: 'DOPPELT', feld: 'zeile5.titel' });
  });

  it('begrenzt die Anzahl und lehnt leere Listen ab', () => {
    expect(validiereAlle([], pruefe).ok).toBe(false);
    const viele = Array.from({ length: MAX_VERANSTALTUNGEN + 1 }, (_, i) => ({
      datum: '2026-10-17',
      titel: `Tanz ${i}`,
    }));
    expect(!validiereAlle(viele, pruefe).ok && true).toBe(true);
  });

  it('nummeriert fachliche Hinweise ebenfalls nach Zeile', () => {
    const r = validiereAlle([{ datum: '2026-05-02', titel: 'Maikirmes' }], pruefe);
    expect(r.ok && r.value.hinweise[0]?.meldung).toMatch(/^Zeile 1: Kirmes liegt außerhalb/);
  });
});
