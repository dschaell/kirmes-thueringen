/* global localStorage, document */
// Gewählte Schriftgröße vor dem ersten Zeichnen setzen, damit nichts springt (Issue #347)
try {
  const s = localStorage.getItem('kirmes-schrift');
  if (s === 'gross' || s === 'sehr-gross') document.documentElement.dataset.schrift = s;
} catch {
  /* ohne Speicher normale Größe */
}
