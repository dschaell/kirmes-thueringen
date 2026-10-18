import type { APIRoute } from 'astro';
import { listeOrte } from '../lib/api';
import { sucheOrte, type OrtKurz } from '../lib/ortssuche';

/** Ortsverzeichnis ändert sich selten – kurz im Speicher halten statt pro Tastendruck laden. */
let cache: { orte: OrtKurz[]; bis: number } | null = null;
async function orte(): Promise<OrtKurz[]> {
  if (cache && cache.bis > Date.now()) return cache.orte;
  const liste = (await listeOrte()).map(({ slug, name, landkreis }) => ({ slug, name, landkreis }));
  if (liste.length) cache = { orte: liste, bis: Date.now() + 10 * 60_000 };
  return liste;
}

/** Bis zu 8 passende Orte für die Ortssuche im Assistenten (Issue #89). */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 60);
  return new Response(JSON.stringify(sucheOrte(await orte(), q)), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
