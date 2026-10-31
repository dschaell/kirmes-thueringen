/**
 * Zugriffszahlen ohne Tracking (Issue #311): zählt im Speicher, welche Seiten aufgerufen wurden,
 * und meldet nur die Summen je Pfad an die API (jede Minute). Keine IP, keine Cookies, kein
 * Referrer, keine Kennung. Nicht gezählt: Bots und Skripte, Redaktion, Dateien, Fehlerseiten.
 */
const BOT =
  /bot|crawl|spider|slurp|preview|fetch|monitor|uptime|curl|wget|python|headless|lighthouse|facebookexternalhit|whatsapp|telegram|zap/i;
const NICHT =
  /^\/(admin|api|_astro|fonts|kacheln)(\/|$)|\.(css|js|mjs|map|png|jpe?g|webp|avif|svg|ico|woff2?|txt|webmanifest|xml|json|ics|csv)$/i;
const MAX = 2000;

/** Zählbarer Pfad ohne Abfrage und Fragment, sonst null */
export function zaehlpfad(url) {
  const pfad = (url ?? '/').split(/[?#]/, 1)[0] || '/';
  if (pfad.length > 200 || NICHT.test(pfad) || !/^\/[\p{L}\p{N}/._~%-]*$/u.test(pfad)) return null;
  try {
    return decodeURIComponent(pfad);
  } catch {
    return null;
  }
}

export function erstelleZaehler({ melde, intervallMs = 60_000 }) {
  let stand = new Map();
  const leere = async () => {
    if (!stand.size) return;
    const aufrufe = [...stand].map(([pfad, anzahl]) => ({ pfad, anzahl }));
    stand = new Map();
    try {
      await melde(aufrufe);
    } catch {
      /* Zählung ist verzichtbar – nie die Website stören */
    }
  };
  const uhr = setInterval(leere, intervallMs);
  uhr.unref?.();
  const zaehle = (req, res) => {
    // Echte Browser nennen sich „Mozilla/…“ – Skripte, Health-Checks und Bots zählen nicht
    const ua = req.headers['user-agent'] ?? '';
    if (req.method !== 'GET' || !ua.startsWith('Mozilla/') || BOT.test(ua)) return;
    const pfad = zaehlpfad(req.url);
    if (!pfad) return;
    res.once('finish', () => {
      const typ = String(res.getHeader('content-type') ?? '');
      if (res.statusCode !== 200 || !typ.startsWith('text/html')) return;
      if (stand.has(pfad) || stand.size < MAX) stand.set(pfad, (stand.get(pfad) ?? 0) + 1);
    });
  };
  return { zaehle, leere, stopp: () => clearInterval(uhr) };
}

/** Meldung an die API (internes Netz); ohne API_URL zählt nichts mit. */
export const meldeAnApi = (apiUrl) => async (aufrufe) => {
  await fetch(new URL('/api/v1/intern/aufrufe', apiUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aufrufe }),
    signal: AbortSignal.timeout(5000),
  });
};
