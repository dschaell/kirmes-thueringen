import type { APIRoute } from 'astro';
import { KachelSpeicher, USER_AGENT, kachelErlaubt, vonUns } from '../../../../lib/kacheln';

const speicher = new KachelSpeicher();
const laufend = new Map<string, Promise<ArrayBuffer | null>>();

async function lade(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/png')) return null;
  return res.arrayBuffer();
}

/** Kartenkachel aus dem Speicher oder von OpenStreetMap – der Browser spricht nur mit uns. */
export const GET: APIRoute = async ({ params, request }) => {
  if (!vonUns(request.headers)) return new Response(null, { status: 403 });
  const k = kachelErlaubt(params.z ?? '', params.x ?? '', params.y ?? '');
  if (!k) return new Response(null, { status: 404 });
  const schluessel = k.join('/');
  let bild = speicher.hole(schluessel);
  if (!bild) {
    let p = laufend.get(schluessel);
    if (!p) {
      p = lade(...k).catch(() => null);
      laufend.set(schluessel, p);
    }
    bild = await p;
    laufend.delete(schluessel);
    if (!bild) return new Response(null, { status: 502 });
    speicher.lege(schluessel, bild);
  }
  return new Response(bild, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=2592000',
    },
  });
};
