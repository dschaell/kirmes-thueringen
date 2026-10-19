/**
 * „Andere Dauer …“ im Assistenten (Issue #150): Das Zahlenfeld erscheint nur, wenn es gewählt ist,
 * und bekommt dann den Fokus. Ohne JavaScript bleibt es sichtbar und wird nur bei „eigen“ gelesen.
 */
const auswahl = document.querySelector<HTMLSelectElement>('select[name="tage"]');
const feld = document.querySelector<HTMLElement>('[data-eigene-dauer]');
const zahl = feld?.querySelector<HTMLInputElement>('input');

function zeige(fokus: boolean) {
  if (!auswahl || !feld || !zahl) return;
  const eigen = auswahl.value === 'eigen';
  feld.hidden = !eigen;
  zahl.required = eigen;
  if (eigen && fokus) zahl.focus();
}
zeige(false);
auswahl?.addEventListener('change', () => zeige(true));

export {};
