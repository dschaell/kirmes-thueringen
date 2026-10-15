/** Meldung an die Redaktion über die API (Versand per SMTP). Läuft nur serverseitig. */
import { isIP } from 'node:net';
import { ApiNichtErreichbar } from './api';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';

const intern = (ip: string) => {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === '::1' || /^f[cd]/i.test(ip);
};

/**
 * IP der Besucher: Hinter Caddy (internes Netz) steht sie in X-Forwarded-For – Caddy überschreibt
 * den Wert von außen. Kommt die Anfrage direkt, gilt die Verbindungsadresse.
 */
export function besucherIp(request: Request, verbindung: string): string {
  const weitergeleitet = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return intern(verbindung) && weitergeleitet && isIP(weitergeleitet) ? weitergeleitet : verbindung;
}

export type MeldungsErgebnis =
  | { status: 'gesendet' }
  | { status: 'fehler'; fehler: { feld: string; meldung: string }[] }
  | { status: 'zu-viele' | 'nicht-moeglich' };

export async function sendeMeldung(
  daten: Record<string, string | number>,
  ip: string,
): Promise<MeldungsErgebnis> {
  let res: Response;
  try {
    res = await fetch(new URL('/api/v1/meldungen', API_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kirmes-client-ip': ip },
      body: JSON.stringify(daten),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  if (res.status === 202) return { status: 'gesendet' };
  if (res.status === 429) return { status: 'zu-viele' };
  if (res.status === 400) {
    const json = await res.json().catch(() => ({}));
    const fehler = Array.isArray(json.fehler)
      ? (json.fehler as { feld: string; meldung: string }[])
      : [{ feld: '', meldung: 'Bitte die Angaben prüfen.' }];
    return { status: 'fehler', fehler };
  }
  return { status: 'nicht-moeglich' };
}
