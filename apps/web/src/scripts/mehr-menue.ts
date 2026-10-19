/**
 * „Mehr“-Menü der Redaktion (Issue #161): schließt bei Klick daneben und mit Esc; der Fokus geht
 * dann zurück auf „Mehr“. Ohne JavaScript bleibt es ein normales Auf-/Zuklappen.
 */
const menue = document.querySelector<HTMLDetailsElement>('.mehr-nav');
const knopf = menue?.querySelector('summary');
document.addEventListener('click', (e) => {
  if (menue?.open && !menue.contains(e.target as Node)) menue.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menue?.open) {
    menue.open = false;
    knopf?.focus();
  }
});

export {};
