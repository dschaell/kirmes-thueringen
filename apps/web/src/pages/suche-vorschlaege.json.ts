import { bandsAus } from '@kirmes/core';
import type { APIRoute } from 'astro';
import { alleTermine, listeOrte } from '../lib/api';
import { heute, plusTage } from '../lib/anzeige';
import { schlageVor, zaehleBands, type OrtMitTerminen } from '../lib/suchvorschlaege';

/** Orte und Bands ändern sich selten – kurz im Speicher halten statt pro Tastendruck laden. */
let cache: { orte: OrtMitTerminen[]; bands: Map<string, number>; bis: number } | null = null;
async function daten() {
  if (cache && cache.bis > Date.now()) return cache;
  const h = heute();
  const [orte, termine] = await Promise.all([
    listeOrte(),
    alleTermine({ von: h, bis: plusTage(h, 365) }),
  ]);
  const neu = {
    orte: orte.map(({ slug, name, landkreis, anzahlKommend }) => ({
      slug,
      name,
      landkreis,
      anzahlKommend,
    })),
    bands: zaehleBands(termine.map((t) => bandsAus(t.band))),
    bis: Date.now() + 10 * 60_000,
  };
  if (neu.orte.length) cache = neu;
  return neu;
}

/** Bis zu 8 Vorschläge fürs Suchfeld (Issue #370); `nur=orte` für die Ortssuche unter „Orte“. */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 60);
  const d = await daten();
  const vorschlaege = schlageVor(d.orte, d.bands, q, {
    nurOrte: url.searchParams.get('nur') === 'orte',
  });
  return new Response(JSON.stringify(vorschlaege), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
