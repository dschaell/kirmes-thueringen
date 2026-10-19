/**
 * Name aus Google-Maps-Link übernehmen (Issue #165): Wird in ein Feld mit
 * data-kartenlink-name="<feldname>" ein Link wie …/maps/place/Kirche+St.+Peter/… eingefügt, füllt
 * sich das genannte Namensfeld im selben Formular – nur wenn es noch leer ist.
 */
import { nameAusKartenlink } from '@kirmes/core';

for (const link of document.querySelectorAll<HTMLInputElement>('input[data-kartenlink-name]')) {
  link.addEventListener('input', () => {
    const ziel = link.form?.elements.namedItem(link.dataset.kartenlinkName ?? '');
    const name = nameAusKartenlink(link.value);
    if (ziel instanceof HTMLInputElement && name && !ziel.value.trim()) {
      ziel.value = name;
      ziel.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}
