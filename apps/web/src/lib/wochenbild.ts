/**
 * Wochenbild (Issue #308): „Kirmes am Wochenende in Thüringen“ mit den Terminen als Bild für
 * Instagram (Beitrag 1080×1350) und Status/Story (1080×1920). Gleiche Technik wie das
 * Vorschaubild je Termin: SVG-Vorlage, mit resvg gerendert, Texte für XML maskiert.
 */
import { Resvg } from '@resvg/resvg-js';
import { umbrechen } from './vorschaubild';

export type Wochenformat = 'beitrag' | 'story';
export interface WochenZeile {
  /** „Sa. 20:00“ */
  wann: string;
  titel: string;
  ort: string;
}

const MASS: Record<Wochenformat, { hoehe: number; zeilen: number }> = {
  // so viele, dass „+ N weitere“ noch über den roten Balken passt
  beitrag: { hoehe: 1350, zeilen: 6 },
  story: { hoehe: 1920, zeilen: 9 },
};
const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? '&apos;',
  );
/** Arial wie die Website; im Container die maßgleiche Liberation Sans (Issue #368) */
const SANS = 'Arial, Liberation Sans, DejaVu Sans, sans-serif';

export function wochenbildSvg(
  zeitraum: string,
  termine: WochenZeile[],
  format: Wochenformat,
): string {
  const { hoehe, zeilen } = MASS[format];
  const oben = format === 'story' ? 260 : 120;
  const sichtbar = termine.slice(0, zeilen);
  const rest = termine.length - sichtbar.length;
  const eintraege = sichtbar
    .map((t, i) => {
      const y = oben + 330 + i * 118;
      const titel = umbrechen(t.titel, 30, 1)[0] ?? '';
      const ort = umbrechen(t.ort, 34, 1)[0] ?? '';
      return `<text x="80" y="${y}" font-family="${SANS}" font-size="30" font-weight="700" fill="#a4161a">${xml(t.wann)}</text>
  <text x="300" y="${y}" font-family="${SANS}" font-size="38" font-weight="700" fill="#211a14">${xml(titel)}</text>
  <text x="300" y="${y + 44}" font-family="${SANS}" font-size="30" fill="#5c5249">${xml(ort)}</text>`;
    })
    .join('\n  ');
  const ende = oben + 330 + sichtbar.length * 118;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${hoehe}" viewBox="0 0 1080 ${hoehe}">
  <rect width="1080" height="${hoehe}" fill="#faf6ef"/>
  <rect y="${oben - 120}" width="1080" height="12" fill="#d4a017"/>
  <text x="80" y="${oben}" font-family="${SANS}" font-size="36" font-weight="700" fill="#a4161a">KIRMESKALENDER THÜRINGEN</text>
  <text x="80" y="${oben + 110}" font-family="${SANS}" font-size="84" font-weight="700" fill="#211a14">Kirmes am</text>
  <text x="80" y="${oben + 200}" font-family="${SANS}" font-size="84" font-weight="700" fill="#211a14">Wochenende</text>
  <text x="80" y="${oben + 260}" font-family="${SANS}" font-size="38" fill="#5c5249">${xml(zeitraum)} · in Thüringen</text>
  ${
    sichtbar.length
      ? eintraege
      : `<text x="80" y="${oben + 380}" font-family="${SANS}" font-size="40" fill="#5c5249">Dieses Wochenende ist noch nichts eingetragen.</text>`
  }
  ${
    rest > 0
      ? `<text x="80" y="${ende + 10}" font-family="${SANS}" font-size="32" font-weight="700" fill="#211a14">+ ${rest} weitere</text>`
      : ''
  }
  <rect y="${hoehe - 150}" width="1080" height="150" fill="#a4161a"/>
  <text x="80" y="${hoehe - 62}" font-family="${SANS}" font-size="40" font-weight="700" fill="#ffffff">kirmeskalender-thueringen.de</text>
</svg>`;
}

export function wochenbildPng(
  zeitraum: string,
  termine: WochenZeile[],
  format: Wochenformat,
): ArrayBuffer {
  const png = new Resvg(wochenbildSvg(zeitraum, termine, format), {
    fitTo: { mode: 'width', value: 1080 },
    font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' },
  })
    .render()
    .asPng();
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}
