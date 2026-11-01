import { describe, expect, it } from 'vitest';
import { schlageVor, zaehleBands } from '../src/lib/suchvorschlaege';

const orte = [
  { slug: 'alkersleben', name: 'Alkersleben', landkreis: 'IK', anzahlKommend: 3 },
  { slug: 'arnstadt', name: 'Arnstadt', landkreis: 'IK', anzahlKommend: 0 },
  { slug: 'bad-berka', name: 'Bad Berka', landkreis: 'AP', anzahlKommend: 1 },
  { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'GTH', anzahlKommend: 0 },
  { slug: 'muehlberg-2', name: 'Mühlberg', landkreis: 'GTH', anzahlKommend: 0 },
];
const bands = new Map([
  ['Alpenexpress', 2],
  ['Berka Blasmusik', 1],
]);

describe('Suchvorschläge (Issue #370)', () => {
  it('schon ab dem ersten Buchstaben: Orte mit Terminen, dann Bands, dann übrige Orte', () => {
    expect(schlageVor(orte, bands, 'a')).toEqual([
      { wert: 'Alkersleben', zusatz: '3 Termine', ziel: '/orte/alkersleben' },
      { wert: 'Alpenexpress', zusatz: 'Band · 2 Termine', ziel: '/termine?q=Alpenexpress' },
      { wert: 'Arnstadt (IK)', zusatz: 'noch keine Termine', ziel: '/orte/arnstadt' },
    ]);
  });
  it('Wortanfang und Umlaute; „irgendwo“ erst ab drei Zeichen', () => {
    expect(schlageVor(orte, bands, 'berk').map((v) => v.wert)).toEqual([
      'Bad Berka',
      'Berka Blasmusik',
    ]);
    expect(schlageVor(orte, bands, 'ue')).toEqual([]);
    expect(schlageVor(orte, bands, 'uehl').map((v) => v.zusatz)).toEqual([
      'noch keine Termine',
      'noch keine Termine',
    ]);
    // Namensvettern unterscheidbar
    expect(schlageVor(orte, bands, 'Mühl').map((v) => v.wert)).toEqual([
      'Mühlberg (GTH) · muehlberg',
      'Mühlberg (GTH) · muehlberg-2',
    ]);
  });
  it('nur Orte, Höchstzahl, leere Eingabe, Einzahl', () => {
    expect(schlageVor(orte, bands, 'a', { nurOrte: true }).map((v) => v.wert)).toEqual([
      'Alkersleben',
      'Arnstadt (IK)',
    ]);
    expect(schlageVor(orte, bands, 'a', { max: 1 })).toHaveLength(1);
    expect(schlageVor(orte, bands, '  ')).toEqual([]);
    expect(schlageVor(orte, bands, 'bad')[0]?.zusatz).toBe('1 Termin');
  });
  it('Bands zählen: je Termin einmal, erste Schreibweise gewinnt', () => {
    expect(
      zaehleBands([['Dynamic', 'DJ Max'], ['dynamic'], ['Dynamic', 'Dynamic'], ['', '  ']]),
    ).toEqual(
      new Map([
        ['Dynamic', 3],
        ['DJ Max', 1],
      ]),
    );
  });
});
