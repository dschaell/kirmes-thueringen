/**
 * Vorschläge im Suchfeld „Ort oder Band“ ab dem ersten Buchstaben (Issue #370). Antippen öffnet
 * den Ort bzw. die Treffer zur Band; Enter ohne Auswahl sucht wie bisher.
 */
import { combobox, holeJson } from './combobox';

interface Vorschlag {
  wert: string;
  zusatz: string;
  ziel: string;
}

for (const feld of document.querySelectorAll<HTMLInputElement>('input[data-suchvorschlaege]')) {
  const nur = feld.dataset.suchvorschlaege === 'orte' ? '&nur=orte' : '';
  combobox<Vorschlag>(feld, {
    quelle: holeJson((q) => `/suche-vorschlaege.json?q=${encodeURIComponent(q)}${nur}`),
    min: 1,
    text: (v) => v.wert,
    zusatz: (v) => v.zusatz,
    waehle: (v) => {
      feld.value = v.wert;
      // nur Pfade der eigenen Seite
      if (v.ziel.startsWith('/')) location.assign(v.ziel);
    },
    name: nur ? 'Passende Orte' : 'Passende Orte und Bands',
    ansage: (n) => (n ? `${n} Vorschläge` : 'Keine Vorschläge'),
  });
}

export {};
