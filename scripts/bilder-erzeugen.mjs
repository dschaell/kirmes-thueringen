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
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#a4161a"/>
  <g transform="translate(0 28) scale(1.75)">
    <path d="M0 2.5 ${Array.from({ length: 10 }, (_, i) => `Q${i * 72 + 18} 6 ${i * 72 + 36} 2.5 T${i * 72 + 72} 2.5`).join(' ')}" fill="none" stroke="#f3d9a4" stroke-width="1.5"/>
    <g transform="scale(1)">${wimpel}</g>
  </g>
  <g transform="translate(90 170) scale(7)" fill="none" stroke-linecap="round">
    <path d="M16 5.5v22" stroke="#faf6ef" stroke-width="2.2"/>
    <ellipse cx="16" cy="11.5" rx="6.5" ry="2.3" stroke="#faf6ef" stroke-width="2"/>
    <path d="M10.6 13l-1.6 7.5M13.4 13.8l-.8 8.2M18.6 13.8l.8 8.2M21.4 13l1.6 7.5" stroke="#e8b04a" stroke-width="1.8"/>
    <path d="M16 2.5l2.6 3.6h-5.2z" fill="#faf6ef" stroke="none"/>
  </g>
  <text x="360" y="300" font-family="Georgia, serif" font-weight="700" font-size="84" fill="#faf6ef">Kirmeskalender</text>
  <text x="360" y="390" font-family="Georgia, serif" font-weight="700" font-size="84" fill="#faf6ef">Thüringen</text>
  <text x="362" y="470" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#f3d9a4">Kirmestanz, Kindertanz und Brauchtum – alle Termine</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile(new URL('og.png', ziel).pathname);
console.log('✔ Icons und og.png erzeugt');
