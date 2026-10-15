/**
 * CSRF-Schutz für den Redaktionsbereich (Synchronizer-Token, zusätzlich zu SameSite=Strict):
 * zufälliges Token je Browser im HttpOnly-Cookie, als verstecktes Feld „csrf_token“ in jedem Formular.
 */
import type { AstroCookies } from 'astro';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'kirmes_csrf';
export const CSRF_FELD = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Vorhandenes Token lesen oder ein neues setzen. Standard: Redaktionsbereich; öffentliche
 * Formulare nutzen ein eigenes Cookie mit eigenem Pfad.
 */
export function csrfToken(
  cookies: AstroCookies,
  { cookie = CSRF_COOKIE, pfad = '/admin' }: { cookie?: string; pfad?: string } = {},
): string {
  const vorhanden = cookies.get(cookie)?.value;
  if (vorhanden && /^[A-Za-z0-9_-]{43}$/.test(vorhanden)) return vorhanden;
  const neu = randomBytes(32).toString('base64url');
  cookies.set(cookie, neu, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'strict',
    path: pfad,
    maxAge: 12 * 3600,
  });
  return neu;
}

/** Vergleich in konstanter Zeit; fehlende oder ungleich lange Werte sind immer ungültig. */
export function csrfGueltig(erwartet: string | undefined, gesendet: unknown): boolean {
  if (!erwartet || typeof gesendet !== 'string') return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cookie für die öffentlichen Formulare (Termin melden). */
export const FORMULAR_COOKIE = 'kirmes_formular';
