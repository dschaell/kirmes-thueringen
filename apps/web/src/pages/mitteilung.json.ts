import type { APIRoute } from 'astro';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';

/** Neueste veröffentlichte Mitteilung für das Popup (oder 204, wenn es keine gibt). */
export const GET: APIRoute = async () => {
  try {
    const res = await fetch(new URL('/api/v1/mitteilungen/aktuell', API_URL), {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.status === 404)
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    if (!res.ok) return new Response(null, { status: 204 });
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    // Mitteilungen sind nicht kritisch – bei Ausfall einfach nichts anzeigen.
    return new Response(null, { status: 204 });
  }
};
