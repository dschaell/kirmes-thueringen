/**
 * Vorschaubild je Termin (1200×630) für WhatsApp, Facebook & Co. (Issue #110): Titel, Datum und
 * Ort stehen im Bild. SVG-Vorlage, gerendert mit resvg – Texte werden für XML maskiert.
 */
import { Resvg } from '@resvg/resvg-js';

const MASKE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
/** Arial wie die Website; im Container die maßgleiche Liberation Sans (Issue #368) */
const SCHRIFT = 'Arial, Liberation Sans, DejaVu Sans, sans-serif';
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => MASKE[c] ?? c);

/** Zeilen umbrechen nach ungefährer Zeichenzahl; zu Langes wird mit „…“ gekürzt. */
export function umbrechen(text: string, proZeile: number, maxZeilen: number): string[] {
  const zeilen: string[] = [];
  let aktuell = '';
  for (const wort of text.trim().split(/\s+/)) {
    const neu = aktuell ? `${aktuell} ${wort}` : wort;
    if (neu.length <= proZeile) aktuell = neu;
    else {
      if (aktuell) zeilen.push(aktuell);
      aktuell = wort.length > proZeile ? `${wort.slice(0, proZeile - 1)}…` : wort;
    }
  }
  if (aktuell) zeilen.push(aktuell);
  if (zeilen.length > maxZeilen) {
    const rest = zeilen.slice(0, maxZeilen);
    rest[maxZeilen - 1] = `${(rest[maxZeilen - 1] ?? '').slice(0, proZeile - 1)}…`;
    return rest;
  }
  return zeilen;
}

export interface BildDaten {
  titel: string;
  wann: string;
  wo: string;
  art: string;
}

export function vorschauSvg(d: BildDaten): string {
  const titel = umbrechen(d.titel, 24, 2);
  const titelY = titel.length === 1 ? 300 : 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#faf6ef"/>
  <rect width="1200" height="110" fill="#a4161a"/>
  <text x="70" y="72" font-family="${SCHRIFT}" font-size="38" font-weight="700" fill="#ffffff">Kirmeskalender Thüringen</text>
  <text x="70" y="${titelY - 100}" font-family="${SCHRIFT}" font-size="30" font-weight="700" fill="#a4161a">${xml(d.art.toUpperCase())}</text>
  ${titel
    .map(
      (z, i) =>
        `<text x="70" y="${titelY + i * 86}" font-family="${SCHRIFT}" font-size="76" font-weight="700" fill="#211a14">${xml(z)}</text>`,
    )
    .join('\n  ')}
  <text x="70" y="${titelY + titel.length * 86 + 40}" font-family="${SCHRIFT}" font-size="40" fill="#211a14">${xml(d.wann)}</text>
  <text x="70" y="${titelY + titel.length * 86 + 100}" font-family="${SCHRIFT}" font-size="40" font-weight="700" fill="#5c5249">${xml(d.wo)}</text>
  <rect y="600" width="1200" height="30" fill="#d4a017"/>
</svg>`;
}

export function vorschauPng(d: BildDaten): ArrayBuffer {
  const png = new Resvg(vorschauSvg(d), {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' },
  })
    .render()
    .asPng();
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}
