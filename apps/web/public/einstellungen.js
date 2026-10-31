/* global localStorage, document */
// Schriftgröße (Issue #347) und Design (Issue #356) vor dem ersten Zeichnen setzen – nichts springt.
// Design: Hintergrund (band/relief/keiner) und Modus (hell/dunkel/System).
const DESIGNS = {
  auto: ['relief', ''],
  'band-dunkel': ['band', 'dunkel'],
  'band-hell': ['band', 'hell'],
  'relief-hell': ['relief', 'hell'],
  'relief-dunkel': ['relief', 'dunkel'],
  schlicht: ['', ''],
};
const html = document.documentElement;
try {
  const s = localStorage.getItem('kirmes-schrift');
  if (s === 'gross' || s === 'sehr-gross') html.dataset.schrift = s;
  const d = localStorage.getItem('kirmes-design');
  const [hintergrund, modus] = DESIGNS[d] ?? DESIGNS.auto;
  if (hintergrund) html.dataset.hintergrund = hintergrund;
  if (modus) html.dataset.modus = modus;
} catch {
  /* ohne Speicher: Standard */
  html.dataset.hintergrund = 'relief';
}
