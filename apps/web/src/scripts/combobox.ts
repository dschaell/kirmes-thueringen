/**
 * Vorschlagsliste unter einem Eingabefeld (Combobox nach WAI-ARIA, Issue #89/#370): Vorschläge
 * kommen beim Tippen vom Server. Ohne JS bleibt es ein normales Textfeld.
 */
export interface ComboboxOptionen<T> {
  /** Vorschläge zur Eingabe holen */
  quelle: (q: string, signal: AbortSignal) => Promise<T[]>;
  /** ab so vielen Zeichen suchen */
  min: number;
  text: (t: T) => string;
  /** kleine zweite Zeile, z. B. „3 Termine“ */
  zusatz?: (t: T) => string;
  waehle: (t: T) => void;
  name: string;
  /** Ansage für Screenreader, z. B. „3 Vorschläge“ */
  ansage: (n: number) => string;
}

let zaehler = 0;
export function combobox<T>(feld: HTMLInputElement, o: ComboboxOptionen<T>) {
  const id = `combobox-${++zaehler}`;
  const liste = document.createElement('ul');
  liste.id = id;
  liste.className = 'ortssuche-liste';
  liste.setAttribute('role', 'listbox');
  liste.setAttribute('aria-label', o.name);
  liste.hidden = true;
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('aria-live', 'polite');
  feld.after(liste, status);
  feld.setAttribute('role', 'combobox');
  feld.setAttribute('aria-autocomplete', 'list');
  feld.setAttribute('aria-expanded', 'false');
  feld.setAttribute('aria-controls', id);
  feld.autocomplete = 'off';

  let treffer: T[] = [];
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
    if (t === undefined) return;
    schliessen();
    clearTimeout(warte);
    o.waehle(t);
  };
  const zeige = (neu: T[]) => {
    treffer = neu;
    liste.replaceChildren(
      ...neu.map((t, i) => {
        const li = document.createElement('li');
        li.id = `${id}-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const titel = document.createElement('span');
        titel.textContent = o.text(t);
        li.append(titel);
        const z = o.zusatz?.(t);
        if (z) {
          const klein = document.createElement('span');
          klein.className = 'zusatz';
          klein.textContent = z;
          li.append(klein);
        }
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
    status.textContent = o.ansage(neu.length);
    markiere(-1);
  };
  const suche = () => {
    const q = feld.value.trim();
    laufend?.abort();
    if (q.length < o.min) return zeige([]);
    laufend = new AbortController();
    o.quelle(q, laufend.signal)
      .then(zeige)
      .catch(() => {
        /* abgebrochen oder offline – das Feld funktioniert auch ohne Vorschläge */
      });
  };

  feld.addEventListener('input', (e) => {
    if (!e.isTrusted) return;
    clearTimeout(warte);
    warte = setTimeout(suche, 120);
  });
  feld.addEventListener('focus', () => {
    if (feld.value.trim().length >= o.min) suche();
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

/** JSON-Vorschläge vom eigenen Server holen */
export const holeJson =
  <T>(pfad: (q: string) => string) =>
  (q: string, signal: AbortSignal): Promise<T[]> =>
    fetch(pfad(q), { signal }).then((r) => (r.ok ? (r.json() as Promise<T[]>) : []));
