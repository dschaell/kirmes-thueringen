/** Fehler sind Werte: Domänenfunktionen werfen nicht, sie geben ein Result zurück. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface Validierungsfehler {
  feld: string;
  code: string;
  meldung: string;
}
