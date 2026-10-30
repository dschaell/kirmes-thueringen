import type { APIRoute } from 'astro';
import { holePlakat } from '../../../../lib/api';

/** Plakat eines Termins (Issue #297). Die Adresse trägt den Stand (?v=…), daher lange cachebar. */
export const GET: APIRoute = async ({ params }) => {
  const groesse =
    params.groesse === 'klein' ? 'klein' : params.groesse === 'gross' ? 'gross' : null;
  const bild = groesse ? await holePlakat(params.id ?? '', groesse) : null;
  if (!bild) return new Response(null, { status: 404 });
  return new Response(bild, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
