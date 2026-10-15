/**
 * Rate-Limit am öffentlichen Einstieg der Website: höchstens `max` Seitenaufrufe je Client-IP im
 * gleitenden Zeitfenster. Statische Dateien (Skripte, Schriften, Bilder) zählen nicht – eine Seite
 * lädt davon viele. Hinter Caddy steht die echte IP in X-Forwarded-For; der Kopfzeile wird nur
 * vertraut, wenn die Verbindung aus einem internen Netz (vom Proxy) kommt.
 */
import { isIP } from 'node:net';

const STATISCH =
  /^\/(_astro|fonts)\/|\.(css|js|mjs|map|png|jpe?g|webp|avif|svg|ico|woff2?|txt|webmanifest)$/i;

export function istIntern(ip) {
  if (!ip) return false;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === '::1' || /^f[cd]/i.test(ip);
}

export function clientIp(req) {
  const verbindung = req.socket?.remoteAddress ?? '';
  const weitergeleitet = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();
  return istIntern(verbindung) && isIP(weitergeleitet) ? weitergeleitet : verbindung;
}

/** Grenzwerte aus der Umgebung (Standard: 120 Seitenaufrufe pro Minute und IP). */
export function ladeGrenzen(env = process.env) {
  const zahl = (wert, standard) => {
    const n = Number(wert);
    return Number.isInteger(n) && n > 0 ? n : standard;
  };
  return {
    max: zahl(env.RATE_LIMIT_MAX, 120),
    fensterMs: zahl(env.RATE_LIMIT_FENSTER_S, 60) * 1000,
    aus: env.RATE_LIMIT_AUS === 'true',
  };
}

/**
 * @returns Funktion (req, res) → true, wenn die Anfrage weiterlaufen darf; sonst ist die 429-Antwort
 *          bereits geschrieben.
 */
export function erstelleRateLimit({ max, fensterMs, aus = false }, jetzt = Date.now) {
  const zugriffe = new Map();
  return (req, res) => {
    if (aus) return true;
    const pfad = (req.url ?? '/').split('?')[0];
    if (STATISCH.test(pfad) || pfad === '/health') return true;
    const t = jetzt();
    if (zugriffe.size > 50_000) zugriffe.clear(); // Schutz vor Speicherüberlauf bei vielen IPs
    const ip = clientIp(req);
    const liste = (zugriffe.get(ip) ?? []).filter((z) => z > t - fensterMs);
    if (liste.length >= max) {
      zugriffe.set(ip, liste);
      const warten = Math.max(1, Math.ceil((liste[0] + fensterMs - t) / 1000));
      res.statusCode = 429;
      res.setHeader('Retry-After', String(warten));
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end('Zu viele Anfragen – bitte kurz warten und dann neu laden.');
      return false;
    }
    liste.push(t);
    zugriffe.set(ip, liste);
    return true;
  };
}
