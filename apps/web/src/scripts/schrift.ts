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

/** Design (Issue #356): wie in /einstellungen.js – Hintergrund und Modus auf <html> */
const DESIGNS: Record<string, [string, string]> = {
  auto: ['relief', ''],
  'band-dunkel': ['band', 'dunkel'],
  'band-hell': ['band', 'hell'],
  'relief-hell': ['relief', 'hell'],
  'relief-dunkel': ['relief', 'dunkel'],
  schlicht: ['', ''],
};
const aktuellesDesign = () => {
  try {
    const d = localStorage.getItem('kirmes-design') ?? 'auto';
    return d in DESIGNS ? d : 'auto';
  } catch {
    return 'auto';
  }
};
const zeigeDesign = () => {
  const d = aktuellesDesign();
  for (const k of document.querySelectorAll<HTMLButtonElement>('[data-design]'))
    k.setAttribute('aria-pressed', String(k.dataset.design === d));
};
for (const gruppe of document.querySelectorAll<HTMLElement>('.design-schalter')) {
  gruppe.hidden = false;
  gruppe.addEventListener('click', (e) => {
    const knopf = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-design]');
    const d = knopf?.dataset.design;
    if (!d || !(d in DESIGNS)) return;
    const [hintergrund, modus] = DESIGNS[d] ?? ['', ''];
    if (hintergrund) html.dataset.hintergrund = hintergrund;
    else delete html.dataset.hintergrund;
    if (modus) html.dataset.modus = modus;
    else delete html.dataset.modus;
    try {
      localStorage.setItem('kirmes-design', d);
    } catch {
      /* ohne Speicher gilt die Wahl nur für diese Seite */
    }
    zeigeDesign();
  });
}
zeigeDesign();

export {};
