import { describe, expect, it } from 'vitest';
import {
  VORLAGE,
  bloecke,
  markiereDubletten,
  pruefeTabelle,
  terminSchluessel,
} from '../src/lib/import';

const orte = [
  { slug: 'alkersleben', name: 'Alkersleben', landkreis: 'IK' },
  { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'IK' },
  { slug: 'muehlberg-gth', name: 'Mühlberg', landkreis: 'GTH' },
];

describe('Tabellen-Import (Issue #105)', () => {
  it('liest die Vorlage: Ort, Art aus Klartext, bestätigt, Muttizettel', () => {
    const { fehler, zeilen } = pruefeTabelle(VORLAGE, orte);
    expect(fehler).toEqual([]);
    expect(
      zeilen.map((z) => [z.status, z.ortSlug, z.termin?.kategorie, z.termin?.bestaetigt]),
    ).toEqual([
      ['neu', 'alkersleben', 'tradition', true],
      ['neu', 'alkersleben', 'tanz', true],
    ]);
    expect(zeilen[1]?.termin).toMatchObject({
      datum: '2026-10-16',
      beginn: '20:00',
      band: 'Dynamic',
      veranstaltungsort: 'Festzelt',
      muttizettel: true,
    });
  });
  it('aus Excel eingefügt (Tabulatoren), Ort per Landkreis eindeutig, Fehler je Zeile', () => {
    const text = [
      'Ort\tKreis\tDatum\tTitel',
      'Mühlberg\tGTH\t17.10.2026\tKirmestanz',
      'Mühlberg\t\t17.10.2026\tKirmestanz',
      'Atlantis\t\t17.10.2026\tKirmestanz',
      'alkersleben\t\t31.02.2026\tKirmestanz',
    ].join('\n');
    const { zeilen } = pruefeTabelle(text, orte);
    expect(zeilen.map((z) => [z.zeile, z.status, z.ortSlug])).toEqual([
      [2, 'neu', 'muehlberg-gth'],
      [3, 'fehler', undefined],
      [4, 'fehler', undefined],
      [5, 'fehler', 'alkersleben'],
    ]);
    expect(zeilen[1]?.meldung).toContain('Landkreis');
  });
  it('Fehler der ganzen Tabelle: leer, Pflichtspalten, zu viele Zeilen', () => {
    expect(pruefeTabelle('  ', orte).fehler[0]).toContain('einfügen');
    expect(pruefeTabelle('Ort;Titel\nA;B', orte).fehler[0]).toContain('datum');
    const viele = [
      'Ort;Datum;Titel',
      ...Array.from({ length: 501 }, () => 'Alkersleben;16.10.2026;X'),
    ].join('\n');
    expect(pruefeTabelle(viele, orte).fehler[0]).toContain('500');
  });
  it('markiert Bestand und Wiederholungen als doppelt, blockt je Ort zu 20', () => {
    const text = [
      'Ort;Datum;Titel',
      'Alkersleben;16.10.2026;Kirmestanz',
      'Alkersleben;16.10.2026;kirmestanz ',
      'Alkersleben;17.10.2026;Kinderkirmes',
    ].join('\n');
    const z = markiereDubletten(
      pruefeTabelle(text, orte).zeilen,
      new Map([['alkersleben', new Set([terminSchluessel('2026-10-17', 'Kinderkirmes')])]]),
    );
    expect(z.map((x) => x.status)).toEqual(['neu', 'doppelt', 'doppelt']);
    const viele = [
      'Ort;Datum;Titel',
      ...Array.from({ length: 25 }, (_, i) => `Alkersleben;16.10.2026;Titel ${i}`),
    ].join('\n');
    expect(bloecke(pruefeTabelle(viele, orte).zeilen).map((b) => b.termine.length)).toEqual([
      20, 5,
    ]);
  });
});
