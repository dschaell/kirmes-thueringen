/**
 * Ortssuche als Combobox (Issue #89): Vorschläge kommen beim Tippen von /orte-suche.json statt
 * als riesige datalist im HTML. Ohne JS bleibt es ein Textfeld; der Server erkennt den Ort.
 */
interface Treffer {
  wert: string;
  slug: string;
}

let zaehler = 0;
for (const feld of document.querySelectorAll<HTMLInputElement>('input[data-ortssuche]')) {
  const id = `ortssuche-${++zaehler}`;
  const liste = document.createElement('ul');
  liste.id = id;
  liste.className = 'ortssuche-liste';
  liste.setAttribute('role', 'listbox');
  liste.setAttribute('aria-label', 'Passende Orte');
  liste.hidden = true;
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('aria-live', 'polite');
  feld.after(liste, status);
  feld.setAttribute('role', 'combobox');
  feld.setAttribute('aria-autocomplete', 'list');
  feld.setAttribute('aria-expanded', 'false');
  feld.setAttribute('aria-controls', id);

  let treffer: Treffer[] = [];
  let aktiv = -1;
  let warte: ReturnType<typeof setTimeout> | undefined;
  let laufend: AbortController | undefined;

  const schliessen = () => {
    liste.hidden = true;
    feld.setAttribute('aria-expanded', 'false');
    feld.removeAttribute('aria-activedescendant');
    aktiv = -1;
  };
  const markiere = (i: number) => {
    aktiv = i;
    [...liste.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) {
      feld.setAttribute('aria-activedescendant', `${id}-${i}`);
      liste.children[i]?.scrollIntoView({ block: 'nearest' });
    } else feld.removeAttribute('aria-activedescendant');
  };
  const waehle = (i: number) => {
    const t = treffer[i];
    if (!t) return;
    feld.value = t.wert;
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    schliessen();
    clearTimeout(warte);
  };
  const zeige = (neu: Treffer[]) => {
    treffer = neu;
    liste.replaceChildren(
      ...neu.map((t, i) => {
        const li = document.createElement('li');
        li.id = `${id}-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.textContent = t.wert;
        // mousedown statt click: Fokus bleibt im Feld, blur schließt nicht vorher
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          waehle(i);
        });
        return li;
      }),
    );
    const offen = neu.length > 0 && document.activeElement === feld;
    liste.hidden = !offen;
    feld.setAttribute('aria-expanded', String(offen));
    status.textContent = neu.length ? `${neu.length} Orte gefunden` : 'Kein Ort gefunden';
    markiere(-1);
  };
  const suche = () => {
    const q = feld.value.trim();
    laufend?.abort();
    if (q.length < 2) return zeige([]);
    laufend = new AbortController();
    fetch(`/orte-suche.json?q=${encodeURIComponent(q)}`, { signal: laufend.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Treffer[]>) : []))
      .then(zeige)
      .catch(() => {
        /* abgebrochen oder offline – das Feld funktioniert auch ohne Vorschläge */
      });
  };

  feld.addEventListener('input', (e) => {
    if (!e.isTrusted) return;
    clearTimeout(warte);
    warte = setTimeout(suche, 150);
  });
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (liste.hidden) {
        if (treffer.length) zeige(treffer);
        else suche();
        return;
      }
      e.preventDefault();
      const n = treffer.length;
      markiere(e.key === 'ArrowDown' ? (aktiv + 1) % n : (aktiv - 1 + n) % n);
    } else if (e.key === 'Enter' && !liste.hidden && aktiv >= 0) {
      e.preventDefault();
      waehle(aktiv);
    } else if (e.key === 'Escape' && !liste.hidden) {
      e.preventDefault();
      schliessen();
    }
  });
  feld.addEventListener('blur', schliessen);
}

export {};
