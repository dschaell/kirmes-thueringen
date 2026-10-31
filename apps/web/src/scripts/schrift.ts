/** Schalter „Schrift größer“ (Issue #347): Stufe auf <html> setzen und merken. */
const html = document.documentElement;
const zeigen = () => {
  for (const knopf of document.querySelectorAll<HTMLButtonElement>('[data-schrift]'))
    knopf.setAttribute(
      'aria-pressed',
      String((html.dataset.schrift ?? '') === knopf.dataset.schrift),
    );
};
for (const gruppe of document.querySelectorAll<HTMLElement>('.schrift-schalter')) {
  gruppe.hidden = false;
  gruppe.addEventListener('click', (e) => {
    const knopf = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-schrift]');
    if (!knopf) return;
    const stufe = knopf.dataset.schrift ?? '';
    if (stufe) html.dataset.schrift = stufe;
    else delete html.dataset.schrift;
    try {
      if (stufe) localStorage.setItem('kirmes-schrift', stufe);
      else localStorage.removeItem('kirmes-schrift');
    } catch {
      /* ohne Speicher gilt die Wahl nur für diese Seite */
    }
    zeigen();
  });
}
zeigen();

export {};
