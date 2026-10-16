/**
 * Zugang zur Redaktion ohne Sitzung (Issue #56): Ersteinrichtung über den Link ans Redaktionspostfach
 * und Einladungen. Läuft nur serverseitig; der Browser spricht nur mit /admin/zugang/*.
 */
import { ApiNichtErreichbar } from './api';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Gültiges Linkformat (32 Zufallsbytes, base64url) – alles andere fragt die API gar nicht erst. */
export const istToken = (t: string | null | undefined): t is string => !!t && TOKEN.test(t);

export type ZugangsArt = 'einrichtung' | 'einladung';
const basis = (art: ZugangsArt) =>
  art === 'einrichtung' ? '/api/v1/admin/einrichtung' : '/api/v1/admin/einladung';

interface Antwort {
  status: number;
  json: Record<string, unknown>;
}
async function rufe(methode: 'GET' | 'POST', pfad: string, body?: unknown): Promise<Antwort> {
  let res: Response;
  try {
    res = await fetch(new URL(pfad, API_URL), {
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
const titel = (a: Antwort, standard: string) => {
  const liste = (a.json.fehler as { meldung: string }[] | undefined)?.map((f) => f.meldung);
  if (liste?.length) return liste.join(' ');
  return typeof a.json.title === 'string' ? a.json.title : standard;
};

export async function einrichtungsStatus(): Promise<{ offen: boolean; moeglich: boolean }> {
  const a = await rufe('GET', basis('einrichtung'));
  return { offen: a.json.offen === true, moeglich: a.json.moeglich === true };
}

export async function sendeEinrichtungslink(): Promise<{ ok: true } | { fehler: string }> {
  const a = await rufe('POST', basis('einrichtung'));
  return a.status === 202
    ? { ok: true }
    : { fehler: titel(a, 'Der Link konnte nicht verschickt werden.') };
}

/** Prüft Link bzw. Einladung; bei Einladungen kommt die Rolle zurück. */
export async function pruefeZugang(
  art: ZugangsArt,
  token: string,
): Promise<{ rolle?: string } | { fehler: string; status: number }> {
  const a = await rufe('GET', `${basis(art)}/${token}`);
  if (a.status === 200)
    return { rolle: typeof a.json.rolle === 'string' ? a.json.rolle : undefined };
  return { fehler: titel(a, 'Der Link ist ungültig.'), status: a.status };
}

export async function zugangsOptionen(art: ZugangsArt, token: string, name: string) {
  const a = await rufe('POST', `${basis(art)}/${token}/optionen`, { name });
  return a.status === 200
    ? { ok: true as const, daten: a.json }
    : { ok: false as const, status: a.status, fehler: titel(a, 'Das hat nicht geklappt.') };
}

export async function zugangAbschliessen(
  art: ZugangsArt,
  token: string,
  vorgang: string,
  antwort: unknown,
): Promise<{ token: string; stunden: number } | { fehler: string; status: number }> {
  const a = await rufe('POST', `${basis(art)}/${token}`, { vorgang, antwort });
  if (a.status === 200 && typeof a.json.token === 'string') {
    return { token: a.json.token, stunden: Number(a.json.stunden) || 12 };
  }
  return { fehler: titel(a, 'Der Passkey konnte nicht angelegt werden.'), status: a.status };
}
