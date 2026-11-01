import { describe, expect, it } from 'vitest';
import { bauePdf, textBreite, umbrechen, type PdfBlock } from '../src/lib/pdf';

const alsText = (b: Uint8Array) => String.fromCharCode(...b);
const zettel: PdfBlock[] = [
  { art: 'titel', text: 'Erziehungs­beauftragung' },
  { art: 'untertitel', text: 'nach § 1 Abs. 1 Nr. 4 JuSchG – „Muttizettel“' },
  { art: 'abschnitt', text: 'Veranstaltung' },
  {
    art: 'felder',
    felder: [
      { label: 'Veranstaltung', wert: 'Kirmestanz (Saal)', breit: true },
      { label: 'Datum', wert: 'Samstag, 7. November 2026', breit: false },
      { label: 'Beginn', wert: '', breit: false },
    ],
  },
  { art: 'absatz', text: 'Gemeinsam mit meinem Kind – spätestens um ________ Uhr.' },
  { art: 'unterschriften', texte: ['Ort, Datum, Unterschrift', 'Unterschrift'] },
  { art: 'klein', text: 'Bitte Ausweise mitbringen. Muster ohne Gewähr.' },
];

describe('PDF für den Muttizettel (Issue #396)', () => {
  it('erzeugt ein gültiges PDF mit stimmenden Byte-Positionen', () => {
    const pdf = alsText(bauePdf(zettel));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const eintraege = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(eintraege).toHaveLength(6);
    eintraege.forEach((pos, i) => expect(pdf.slice(pos).startsWith(`${i + 1} 0 obj`)).toBe(true));
    const laenge = Number(/\/Length (\d+)/.exec(pdf)?.[1]);
    const start = pdf.indexOf('stream\n') + 7;
    expect(pdf.slice(start + laenge, start + laenge + 10)).toBe('\nendstream');
  });

  it('schreibt Umlaute und Anführungszeichen in WinAnsi, ohne Trennzeichen', () => {
    const pdf = alsText(bauePdf(zettel));
    expect(pdf).toContain('(Erziehungsbeauftragung)');
    expect(pdf).toContain('§ 1'); // §
    expect(pdf).toContain('\u0084Muttizettel\u0093'); // „…“
    expect(pdf).toContain('spätestens'); // ä
    expect(pdf).toContain('(Kirmestanz \\(Saal\\))'); // Klammern maskiert
    expect(pdf).toContain('/Encoding /WinAnsiEncoding');
  });

  it('bricht um und misst Breiten', () => {
    expect(textBreite('ii', 10)).toBeLessThan(textBreite('MM', 10));
    expect(textBreite('Ä', 10)).toBeCloseTo(6.67, 1);
    expect(textBreite('A', 10, true)).toBeGreaterThan(textBreite('A', 10));
    const zeilen = umbrechen('eins zwei drei vier fünf sechs sieben', 10, 60);
    expect(zeilen.length).toBeGreaterThan(1);
    zeilen.forEach((z) => expect(textBreite(z, 10)).toBeLessThanOrEqual(60));
    expect(umbrechen('', 10, 60)).toEqual(['']);
  });

  it('passt viel Text auf eine Seite (Schrift wird kleiner)', () => {
    const lang: PdfBlock[] = Array.from({ length: 40 }, () => ({
      art: 'absatz',
      text: 'Ein langer Absatz, der viel Platz braucht und mehrfach umbricht. '.repeat(3),
    }));
    const pdf = alsText(bauePdf(lang));
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(1);
    const ys = [...pdf.matchAll(/ ([\d.]+) Td /g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });
});
