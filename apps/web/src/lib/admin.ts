/**
 * Redaktionsbereich der Website: Sitzung im HttpOnly-Cookie, Zugriff auf die Admin-API.
 * Läuft nur serverseitig. Der Browser sieht das Sitzungs-Token nie per JavaScript.
 */
import type { AstroCookies } from 'astro';
import { ApiNichtErreichbar } from './api';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';
export const SITZUNGS_COOKIE = 'kirmes_admin';

export function setzeSitzung(cookies: AstroCookies, token: string, stunden: number) {
  cookies.set(SITZUNGS_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD, // lokal (http://localhost) ohne, auf dem Server nur über HTTPS
    sameSite: 'strict',
    path: '/admin',
    maxAge: stunden * 3600,
  });
}

export const loescheSitzung = (cookies: AstroCookies) =>
  cookies.delete(SITZUNGS_COOKIE, { path: '/admin' });

export interface AdminAntwort<T> {
  status: number;
  daten: T | null;
  fehler: string[];
}

/** Aufruf der Admin-API mit dem Token aus dem Cookie. */
export async function adminApi<T = unknown>(
  cookies: AstroCookies,
  methode: 'GET' | 'POST' | 'PUT' | 'DELETE',
  pfad: string,
  body?: unknown,
): Promise<AdminAntwort<T>> {
  const token = cookies.get(SITZUNGS_COOKIE)?.value ?? '';
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/admin/${pfad}`, API_URL), {
      method: methode,
      headers: {
        authorization: `Sitzung ${token}`,
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  const fehler = res.ok
    ? []
    : ((json?.fehler as { meldung: string }[] | undefined)?.map((f) => f.meldung) ?? [
        json?.title ?? `Fehler ${res.status}`,
      ]);
  return { status: res.status, daten: res.ok ? (json as T) : null, fehler };
}

/** Anmeldung (ohne Cookie) – liefert Token oder Fehlermeldung. */
/** Formularfeld als Text (leer, wenn nicht vorhanden). */
export const feld = (f: FormData, name: string) => {
  const v = f.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

/** JSON-Antwort der Redaktions-Endpunkte (nie gecacht). */
export const jsonAntwort = (status: number, daten: unknown) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** JSON-Body einer Anfrage (bis 64 KB) oder null. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => '');
  if (!text || text.length > 64 * 1024) return null;
  try {
    const wert: unknown = JSON.parse(text);
    return wert && typeof wert === 'object' && !Array.isArray(wert)
      ? (wert as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
