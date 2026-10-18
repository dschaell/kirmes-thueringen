import type { APIRoute } from 'astro';
import { USER_AGENT, vonUns } from '../lib/kacheln';

/**
 * Adresssuche für die Festplatz-Seite über den eigenen Server (Issue #103): keine IP-Adresse an
 * Nominatim. Höchstens eine Anfrage pro Sekunde (Nominatim-Nutzungsbedingungen), Ergebnisse gecacht.
 */
const cache = new Map<string, { lat: number; lon: number } | null>();
let letzte = 0;
export const GET: APIRoute = async ({ url, request }) => {
  if (!vonUns(request.headers)) return new Response(null, { status: 403 });
  const q = (url.searchParams.get('q') ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, 200);
  const antwort = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  if (q.length < 3) return antwort(null);
  if (cache.has(q)) return antwort(cache.get(q));
  const warte = letzte + 1_000 - Date.now();
  if (warte > 0) return antwort({ fehler: 'Bitte kurz warten.' }, 429);
  letzte = Date.now();
  const ziel = new URL('https://nominatim.openstreetmap.org/search');
  ziel.search = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'de',
    viewbox: '9.8,51.75,12.75,50.1',
    bounded: '1',
    q,
  }).toString();
  try {
    const res = await fetch(ziel, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return antwort({ fehler: 'Adresssuche nicht erreichbar.' }, 502);
    const [t] = (await res.json()) as { lat: string; lon: string }[];
    const treffer = t ? { lat: Number(t.lat), lon: Number(t.lon) } : null;
    if (cache.size > 500) cache.clear();
    cache.set(q, treffer);
    return antwort(treffer);
  } catch {
    return antwort({ fehler: 'Adresssuche nicht erreichbar.' }, 502);
  }
};
