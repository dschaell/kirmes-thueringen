// Erzeugt PNG-Icons und das Vorschaubild für soziale Netze (WhatsApp, Facebook) aus SVG.
// Aufruf: node scripts/bilder-erzeugen.mjs  – Ergebnis liegt in apps/web/public und wird committet.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const ziel = new URL('../apps/web/public/', import.meta.url);
const icon = readFileSync(new URL('favicon.svg', ziel));
for (const [datei, groesse] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(icon, { density: 1200 })
    .resize(groesse, groesse)
    .png()
    .toFile(new URL(datei, ziel).pathname);
}

const wimpel = Array.from({ length: 10 }, (_, i) => {
  const x = i * 72;
  return `<g transform="translate(${x} 0) scale(1)">
    <path d="M3 3.2 L15 3.9 L9 17z" fill="#a4161a"/><path d="M21 4.1 L33 3.1 L27 18z" fill="#ffffff"/>
    <path d="M39 3.1 L51 4.1 L45 18z" fill="#d9a12b"/><path d="M57 3.9 L69 3.2 L63 17z" fill="#ffffff"/></g>`;
}).join('');
// Kirmesbaum (Issue #349/#376) aus der SVG-Vorlage neben diesem Skript
const baum = readFileSync(new URL('kirmesbaum.svg', import.meta.url), 'utf8');
const ebenen = [/<svg[^>]*>([\s\S]*)<\/svg>/.exec(baum)?.[1] ?? ''];
// Arial wie die Website (Issue #368)
const SCHRIFT = 'Arial, Helvetica, sans-serif';
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="tiefe" cx="0.85" cy="0.9" r="0.9">
      <stop offset="0" stop-color="#7d0f12"/><stop offset="1" stop-color="#a4161a"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#tiefe)"/>
  <g transform="translate(0 22) scale(1.75)">
    <path d="M0 2.5 ${Array.from({ length: 10 }, (_, i) => `Q${i * 72 + 18} 6 ${i * 72 + 36} 2.5 T${i * 72 + 72} 2.5`).join(' ')}" fill="none" stroke="#f3d9a4" stroke-width="1.5"/>
    <g>${wimpel}</g>
  </g>
  <circle cx="930" cy="360" r="215" fill="#faf6ef"/>
  <g transform="translate(780 205) scale(1)">${ebenen.join('')}</g>
  <text x="80" y="250" font-family="${SCHRIFT}" font-weight="700" font-size="92" fill="#ffffff">Kirmes in</text>
  <text x="80" y="350" font-family="${SCHRIFT}" font-weight="700" font-size="92" fill="#ffffff">Thüringen</text>
  <text x="82" y="425" font-family="${SCHRIFT}" font-size="34" fill="#f3d9a4">Alle Termine – vom Kirmestanz</text>
  <text x="82" y="470" font-family="${SCHRIFT}" font-size="34" fill="#f3d9a4">bis zur Kirmesbeerdigung</text>
  <text x="82" y="565" font-family="${SCHRIFT}" font-weight="700" font-size="30" fill="#ffffff" fill-opacity="0.85">kirmeskalender-thueringen.de</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile(new URL('og.png', ziel).pathname);
console.log('✔ Icons und og.png erzeugt');
