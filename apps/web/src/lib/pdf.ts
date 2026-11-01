/**
 * Kleiner PDF-Erzeuger für den Muttizettel (Issue #396). In der App vom iPhone-Home-Bildschirm
 * gibt es kein Drucken; das PDF entsteht deshalb auf dem Gerät – die Angaben verlassen es nicht.
 * Nur das Nötige: eine A4-Seite, Helvetica (in jedem PDF-Programm eingebaut), Text und Linien.
 */
export type PdfBlock =
  | { art: 'titel' | 'untertitel' | 'abschnitt' | 'absatz' | 'klein'; text: string }
  | { art: 'felder'; felder: { label: string; wert: string; breit: boolean }[] }
  | { art: 'unterschriften'; texte: string[] };

const BREITE = 595.28;
const HOEHE = 841.89;
const RAND = 40;
const SPALTE = BREITE - 2 * RAND;

// Zeichenbreiten von Helvetica (1/1000 em) für ASCII 32–126
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
// Zeichen außerhalb von ASCII: Code in WinAnsi (Windows-1252) und Breite
const WEITERE: Record<string, [number, number]> = {
  ä: [0xe4, 556],
  ö: [0xf6, 556],
  ü: [0xfc, 556],
  Ä: [0xc4, 667],
  Ö: [0xd6, 778],
  Ü: [0xdc, 722],
  ß: [0xdf, 611],
  é: [0xe9, 556],
  '§': [0xa7, 556],
  '„': [0x84, 333],
  '“': [0x93, 333],
  '”': [0x94, 333],
  '‚': [0x82, 222],
  '‘': [0x91, 222],
  '’': [0x92, 222],
  '–': [0x96, 556],
  '—': [0x97, 1000],
  '·': [0xb7, 278],
  '…': [0x85, 1000],
  '€': [0x80, 556],
};

/** Text als WinAnsi-Bytes (je Zeichen ein Code 0–255); Unbekanntes wird „?“ */
function kodiere(text: string): number[] {
  return [...text.replace(/­/g, '')].map((z) => {
    const c = z.charCodeAt(0);
    if (c >= 32 && c <= 126) return c;
    return WEITERE[z]?.[0] ?? (c >= 0xa0 && c <= 0xff ? c : 63);
  });
}

/** Breite in Punkt; fett etwas breiter gerechnet, damit nichts übersteht */
export function textBreite(text: string, groesse: number, fett = false): number {
  let summe = 0;
  for (const z of text) {
    const c = z.charCodeAt(0);
    summe += c >= 32 && c <= 126 ? (ASCII[c - 32] ?? 556) : (WEITERE[z]?.[1] ?? 556);
  }
  return (summe / 1000) * groesse * (fett ? 1.08 : 1);
}

/** Zeilenumbruch an Leerzeichen */
export function umbrechen(text: string, groesse: number, breite: number, fett = false): string[] {
  const zeilen: string[] = [];
  let zeile = '';
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    const versuch = zeile ? `${zeile} ${wort}` : wort;
    if (zeile && textBreite(versuch, groesse, fett) > breite) {
      zeilen.push(zeile);
      zeile = wort;
    } else zeile = versuch;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen.length ? zeilen : [''];
}

const zahl = (n: number) => (Math.round(n * 100) / 100).toString();
const pdfText = (text: string) =>
  `(${String.fromCharCode(...kodiere(text)).replace(/[\\()]/g, (z) => `\\${z}`)})`;

/** Eine A4-Seite aus Blöcken; reicht der Platz nicht, wird die Schrift kleiner. */
export function bauePdf(bloecke: PdfBlock[]): Uint8Array<ArrayBuffer> {
  let inhalt = '';
  for (const faktor of [1, 0.92, 0.85, 0.78, 0.7]) {
    const r = setze(bloecke, faktor);
    inhalt = r.inhalt;
    if (r.y >= RAND) break;
  }
  return verpacke(inhalt);
}

function setze(bloecke: PdfBlock[], f: number): { inhalt: string; y: number } {
  const teile: string[] = [];
  let y = HOEHE - RAND;
  const text = (t: string, x: number, yy: number, groesse: number, fett = false, grau = false) =>
    teile.push(
      `BT /${fett ? 'F2' : 'F1'} ${zahl(groesse)} Tf ${grau ? '0.35 g' : '0 g'} ${zahl(x)} ${zahl(yy)} Td ${pdfText(t)} Tj ET`,
    );
  const linie = (x1: number, x2: number, yy: number) =>
    teile.push(`0 G 0.6 w ${zahl(x1)} ${zahl(yy)} m ${zahl(x2)} ${zahl(yy)} l S`);
  const absatz = (t: string, groesse: number, fett = false, grau = false, abstand = 1.35) => {
    for (const z of umbrechen(t, groesse, SPALTE, fett)) {
      y -= groesse * abstand;
      text(z, RAND, y, groesse, fett, grau);
    }
  };
  for (const b of bloecke) {
    switch (b.art) {
      case 'titel':
        absatz(b.text, 20 * f, true, false, 1.1);
        break;
      case 'untertitel':
        absatz(b.text, 9.5 * f, false, true);
        y -= 4 * f;
        break;
      case 'abschnitt':
        y -= 10 * f;
        absatz(b.text, 10.5 * f, true);
        break;
      case 'absatz':
        y -= 4 * f;
        absatz(b.text, 10 * f);
        break;
      case 'klein':
        y -= 14 * f;
        absatz(b.text, 7.5 * f, false, true);
        break;
      case 'felder': {
        const halb = (SPALTE - 18) / 2;
        let links = true;
        for (const feld of b.felder) {
          // breite Felder und linke Hälften beginnen eine neue Zeile
          const neueZeile = feld.breit || links;
          if (neueZeile) y -= 30 * f;
          const x = neueZeile ? RAND : RAND + halb + 18;
          const w = feld.breit ? SPALTE : halb;
          text(feld.label, x, y + 18 * f, 7.5 * f, false, true);
          // langer Wert: auf die Feldbreite kürzen statt über den Rand zu laufen
          const wert = umbrechen(feld.wert, 10.5 * f, w - 4)[0] ?? '';
          if (wert) text(wert, x + 2, y + 4 * f, 10.5 * f);
          linie(x, x + w, y);
          links = feld.breit || !links;
        }
        break;
      }
      case 'unterschriften': {
        y -= 52 * f;
        const halb = (SPALTE - 28) / 2;
        b.texte.forEach((t, i) => {
          const x = RAND + i * (halb + 28);
          linie(x, x + halb, y);
          umbrechen(t, 8 * f, halb).forEach((z, j) =>
            text(z, x, y - 11 * f - j * 10 * f, 8 * f, false, true),
          );
        });
        y -= 22 * f;
        break;
      }
    }
  }
  return { inhalt: teile.join('\n'), y };
}

/** Objekte, Querverweistabelle und Trailer – Positionen in Bytes */
function verpacke(inhalt: string): Uint8Array<ArrayBuffer> {
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${zahl(BREITE)} ${zahl(HOEHE)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const positionen: number[] = [];
  objekte.forEach((o, i) => {
    positionen.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const p of positionen) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Jedes Zeichen steht für genau ein Byte (WinAnsi bzw. ASCII)
  const bytes = new Uint8Array(new ArrayBuffer(pdf.length));
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
