/**
 * Ersten Redaktionszugang im Browser einrichten (Issue #48). Läuft nur serverseitig; der
 * QR-Code entsteht hier als SVG – im Browser läuft dafür kein Skript.
 */
import QRCode from 'qrcode';
import { ApiNichtErreichbar } from './api';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';

interface Antwort {
  status: number;
  json: Record<string, unknown>;
}

async function rufe(methode: 'GET' | 'POST', pfad: string, body?: unknown): Promise<Antwort> {
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/admin/einrichtung${pfad}`, API_URL), {
      method: methode,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  return { status: res.status, json: ((await res.json().catch(() => ({}))) ?? {}) as never };
}

const titel = (a: Antwort, standard: string) =>
  typeof a.json.title === 'string' ? a.json.title : standard;

/** Gültiges Linkformat (32 Zufallsbytes, base64url) – alles andere fragt die API gar nicht erst. */
export const istLink = (l: string | null): l is string => !!l && /^[A-Za-z0-9_-]{43}$/.test(l);

export async function einrichtungsStatus(): Promise<{ offen: boolean; moeglich: boolean }> {
  const a = await rufe('GET', '');
  return { offen: a.json.offen === true, moeglich: a.json.moeglich === true };
}

export async function sendeEinrichtungslink(): Promise<{ ok: true } | { fehler: string }> {
  const a = await rufe('POST', '');
  return a.status === 202
    ? { ok: true }
    : { fehler: titel(a, 'Der Link konnte nicht verschickt werden.') };
}

export async function ladeEinrichtung(
  link: string,
): Promise<{ geheimnis: string; qrSvg: string } | { fehler: string; status: number }> {
  const a = await rufe('GET', `/${link}`);
  const g = a.json.totpGeheimnis;
  if (a.status !== 200 || typeof g !== 'string') {
    return { fehler: titel(a, 'Der Link ist ungültig.'), status: a.status };
  }
  const url = `otpauth://totp/${encodeURIComponent('Kirmeskalender Thüringen:Redaktion')}?secret=${g}&issuer=${encodeURIComponent('Kirmeskalender Thüringen')}&digits=6&period=30`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { geheimnis: g, qrSvg };
}

export async function schliesseEinrichtungAb(
  link: string,
  daten: { email: string; passwort: string; passwortWiederholung: string; code: string },
): Promise<{ token: string; stunden: number } | { fehler: string[]; status: number }> {
  const a = await rufe('POST', `/${link}`, daten);
  if (a.status === 200 && typeof a.json.token === 'string') {
    return { token: a.json.token, stunden: Number(a.json.stunden) || 12 };
  }
  const liste = (a.json.fehler as { meldung: string }[] | undefined)?.map((f) => f.meldung);
  return { fehler: liste ?? [titel(a, 'Die Einrichtung ist fehlgeschlagen.')], status: a.status };
}
