/**
 * Terminformular (Issue #353): Beim Wechsel der Art heißt das Musikfeld beim Gottesdienst „Chor …“,
 * und das Feld Pfarrer/in erscheint. Ohne JavaScript entscheidet der gespeicherte Stand.
 */
// wie musikFeld in lib/anzeige.ts – hier ohne die Server-Abhängigkeiten
const musikFeld = (art: string) =>
  art === 'tradition' ? 'Chor / Gesang / musikalische Begleitung' : 'Band / DJ';

for (const gruppe of document.querySelectorAll<HTMLElement>('[data-terminfelder]')) {
  const art = gruppe.querySelector<HTMLSelectElement>('select[data-art]');
  const label = gruppe.querySelector('[data-musik-label]');
  const pfarrer = gruppe.querySelector<HTMLElement>('[data-pfarrer]');
  art?.addEventListener('change', () => {
    if (label) label.textContent = musikFeld(art.value);
    const feld = pfarrer?.querySelector('input');
    if (pfarrer) pfarrer.hidden = art.value !== 'tradition' && !feld?.value;
  });
}

export {};
