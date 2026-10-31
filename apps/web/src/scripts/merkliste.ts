/** Merkliste im Browser (Issue #295) – eigenes Modul, damit Merken und Push sie teilen. */
export const SCHLUESSEL = 'kirmes-gemerkt';
const MAX = 100;
export const ID = /^[0-9a-f-]{36}$/;

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
