/**
 * Programm im Assistenten sofort der Reihe nach (Issue #149): Ändert jemand Tag oder Uhrzeit, rückt
 * die Zeile gleich an ihren Platz. Die Feldnamen tragen feste Indizes, die Reihenfolge im DOM ist
 * für das Formular egal; ohne JavaScript sortiert der Server beim nächsten Schritt.
 */
const liste = document.querySelector<HTMLUListElement>('.programm-kompakt');
const NEU = liste?.dataset.neu ?? 'Neue Veranstaltung';
const wochentag = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const wert = (zeile: Element, feld: string) =>
  zeile.querySelector<HTMLInputElement>(`input[name^="${feld}-"]`)?.value ?? '';
const schluessel = (zeile: Element) =>
  `${wert(zeile, 'datum')} ${wert(zeile, 'beginn') || '99:99'}`;

function zeitText(zeile: Element) {
  const datum = wert(zeile, 'datum');
  const beginn = wert(zeile, 'beginn');
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(datum) ? wochentag.format(new Date(datum)) : '';
  return [tag, beginn && `${beginn} Uhr`].filter(Boolean).join(' · ');
}

// Titel sofort in der Zeile zeigen, nicht erst nach dem nächsten Schritt (Issue #221)
liste?.addEventListener('input', (e) => {
  const feld = e.target as HTMLInputElement;
  if (!/^titel-\d+$/.test(feld.name)) return;
  const titel = feld.closest('.programmzeile')?.querySelector('.zeilentitel');
  if (titel) titel.textContent = feld.value.trim() || NEU;
});

liste?.addEventListener('change', (e) => {
  const feld = e.target as HTMLInputElement;
  if (!/^(datum|beginn)-\d+$/.test(feld.name)) return;
  const zeile = feld.closest('.programmzeile');
  const anzeige = zeile?.querySelector('.zeitangabe');
  if (anzeige) anzeige.textContent = zeitText(zeile as Element);
  const zeilen = Array.from(liste.querySelectorAll(':scope > .programmzeile'));
  const sortiert = [...zeilen].sort((a, b) => schluessel(a).localeCompare(schluessel(b)));
  if (sortiert.every((z, i) => z === zeilen[i])) return;
  liste.append(...sortiert);
  feld.focus();
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  zeile?.scrollIntoView({ block: 'nearest', behavior: ruhig ? 'auto' : 'smooth' });
});

export {};
