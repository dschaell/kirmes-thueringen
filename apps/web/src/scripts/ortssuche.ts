/**
 * Ortssuche als Combobox (Issue #89): Vorschläge kommen beim Tippen von /orte-suche.json statt
 * als riesige datalist im HTML. Ohne JS bleibt es ein Textfeld; der Server erkennt den Ort.
 */
import { combobox, holeJson } from './combobox';

interface Treffer {
  wert: string;
  slug: string;
}

for (const feld of document.querySelectorAll<HTMLInputElement>('input[data-ortssuche]')) {
  combobox<Treffer>(feld, {
    quelle: holeJson((q) => `/orte-suche.json?q=${encodeURIComponent(q)}`),
    min: 2,
    text: (t) => t.wert,
    waehle: (t) => {
      feld.value = t.wert;
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    },
    name: 'Passende Orte',
    ansage: (n) => (n ? `${n} Orte gefunden` : 'Kein Ort gefunden'),
  });
}

export {};
