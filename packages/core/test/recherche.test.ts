import { describe, expect, it } from 'vitest';
import { erkenneKategorie, leseRecherche, normDatum, normUhrzeit, parseCsv } from '../src/index.js';

describe('parseCsv', () => {
  it('erkennt Semikolon (deutsches Excel) und Anführungszeichen', () => {
    const csv =
      '﻿ort;datum;titel\r\nMühlberg;18.10.2026;"Kirmestanz mit ""Belconda""; Teil 2"\r\n\r\n';
    expect(parseCsv(csv)).toEqual([
      ['ort', 'datum', 'titel'],
      ['Mühlberg', '18.10.2026', 'Kirmestanz mit "Belconda"; Teil 2'],
    ]);
  });
  it('erkennt Komma (Google Sheets) und Zeilenumbrüche in Feldern', () => {
    expect(parseCsv('ort,titel\nUlla,"Zeile 1\nZeile 2"')).toEqual([
      ['ort', 'titel'],
      ['Ulla', 'Zeile 1\nZeile 2'],
    ]);
  });
});

describe('normDatum / normUhrzeit', () => {
  it.each([
    ['18.10.2026', '2026-10-18'],
    ['8.5.26', '2026-05-08'],
    ['2026-10-18', '2026-10-18'],
  ])('%s → %s', (roh, iso) => expect(normDatum(roh)).toBe(iso));
  it.each([
    ['20:00', '20:00'],
    ['20.00', '20:00'],
    ['20 Uhr', '20:00'],
    ['9:30', '09:30'],
    ['', null],
    ['abends', 'abends'],
  ])('%s → %s', (roh, hhmm) => expect(normUhrzeit(roh)).toBe(hhmm));
});

describe('erkenneKategorie (drei Arten, Issue #64)', () => {
  it.each([
    ['Kindertanz', 'familie'],
    ['Kinderkirmes', 'familie'],
    ['Familiennachmittag', 'familie'],
    ['Kirmesbeerdigung', 'tradition'],
    ['Kirmesgottesdienst', 'tradition'],
    ['Ständchen', 'tradition'],
    ['Kirmesumzug', 'tradition'],
    ['Frühschoppen mit den „Thanas“', 'tradition'],
    ['Traditionelles Frühshoppen', 'tradition'],
    ['Früh-Schoppen', 'tradition'],
    ['Kirmesausklang', 'tradition'],
    ['Osterfeuer mit Tanz', 'tradition'],
    ['Kirmestanz mit „Belconda“', 'party'],
    ['Kirmestanz', 'party'],
    ['Kirmesparty', 'party'],
    ['Discoparty mit DJ Holler', 'party'],
    ['Tanz in den Mai mit „Vincent“', 'party'],
    ['Herbstball', 'party'],
  ])('%s → %s', (titel, k) => expect(erkenneKategorie(titel)).toBe(k));
});

describe('leseRecherche', () => {
  it('liest Zeilen mit Zeilennummern, Standardwerten und Kategorie-Erkennung', () => {
    const r = leseRecherche([
      [
        'Ort',
        'Landkreis',
        'Datum',
        'Beginn',
        'Titel',
        'Veranstaltungsort',
        'Kategorie',
        'Bestätigt',
        'Quelle',
      ],
      [
        'Mühlberg',
        'gth',
        '18.10.2026',
        '20 Uhr',
        'Kirmestanz',
        'Festzelt',
        '',
        'ja',
        'instagram.com/p/…',
      ],
      ['Ulla', '', '2026-11-07', '', 'Kindertanz', '', '', '', ''],
    ]);
    expect(r).toEqual({
      ok: true,
      value: [
        {
          zeile: 2,
          daten: {
            ort: 'Mühlberg',
            landkreis: 'GTH',
            datum: '2026-10-18',
            beginn: '20:00',
            titel: 'Kirmestanz',
            veranstaltungsort: 'Festzelt',
            kategorie: 'party',
            bestaetigt: true,
            quelle: 'instagram.com/p/…',
            band: null,
            info: null,
            muttizettel: false,
          },
        },
        {
          zeile: 3,
          daten: {
            ort: 'Ulla',
            landkreis: null,
            datum: '2026-11-07',
            beginn: null,
            titel: 'Kindertanz',
            veranstaltungsort: null,
            kategorie: 'familie',
            bestaetigt: false,
            quelle: null,
            band: null,
            info: null,
            muttizettel: false,
          },
        },
      ],
    });
  });

  it('meldet fehlende Pflichtspalten und leere Tabellen', () => {
    expect(leseRecherche([['Ort', 'Titel']]).ok).toBe(false);
    expect(leseRecherche([]).ok).toBe(false);
  });

  it('liest die optionalen Spalten Band und Hinweise', () => {
    const r = leseRecherche([
      ['Ort', 'Datum', 'Titel', 'Band', 'Hinweise'],
      ['Ulla', '2026-11-07', 'Kirmestanz', 'Belconda', 'Eintritt 8 €'],
    ]);
    expect(r.ok && r.value[0]?.daten).toMatchObject({ band: 'Belconda', info: 'Eintritt 8 €' });
  });

  it('liest die optionale Spalte Muttizettel', () => {
    const r = leseRecherche([
      ['Ort', 'Datum', 'Titel', 'Muttizettel'],
      ['Ulla', '2026-11-07', 'Kirmestanz', 'ja'],
      ['Ulla', '2026-11-08', 'Frühschoppen', ''],
    ]);
    expect(r.ok && r.value.map((z) => z.daten.muttizettel)).toEqual([true, false]);
  });
});
