/**
 * Termine merken (Issue #295): nur in diesem Browser (localStorage) – kein Konto, kein Server,
 * kein Tracking. Knöpfe mit data-merken="<Termin-ID>" sind ohne JavaScript ausgeblendet.
 */
export const SCHLUESSEL = 'kirmes-gemerkt';
const MAX = 100;
const ID = /^[0-9a-f-]{36}$/;

export function gemerkte(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]');
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && ID.test(x))
      : [];
  } catch {
    return [];
  }
}

export function speichere(ids: string[]): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify([...new Set(ids)].slice(-MAX)));
  } catch {
    /* privater Modus – Merken klappt dann nicht dauerhaft */
  }
}

function zeige(k: HTMLButtonElement, an: boolean) {
  k.setAttribute('aria-pressed', String(an));
  const text = k.querySelector('.merken-text');
  if (text) text.textContent = an ? 'Gemerkt' : 'Merken';
}

for (const k of document.querySelectorAll<HTMLButtonElement>('button[data-merken]')) {
  const id = k.dataset.merken ?? '';
  if (!ID.test(id)) continue;
  k.hidden = false;
  zeige(k, gemerkte().includes(id));
  k.addEventListener('click', () => {
    const alle = gemerkte();
    const an = !alle.includes(id);
    speichere(an ? [...alle, id] : alle.filter((x) => x !== id));
    zeige(k, an);
  });
}
