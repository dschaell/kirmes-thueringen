/**
 * CSRF-Schutz für den Redaktionsbereich (Synchronizer-Token, zusätzlich zu SameSite=Strict):
 * zufälliges Token je Browser im HttpOnly-Cookie, als verstecktes Feld „csrf_token“ in jedem Formular.
 */
import type { AstroCookies } from 'astro';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'kirmes_csrf';
export const CSRF_FELD = 'csrf_token';

/** Vorhandenes Token lesen oder ein neues setzen. */
export function csrfToken(cookies: AstroCookies): string {
  const vorhanden = cookies.get(CSRF_COOKIE)?.value;
  if (vorhanden && /^[A-Za-z0-9_-]{43}$/.test(vorhanden)) return vorhanden;
  const neu = randomBytes(32).toString('base64url');
  cookies.set(CSRF_COOKIE, neu, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'strict',
    path: '/admin',
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
