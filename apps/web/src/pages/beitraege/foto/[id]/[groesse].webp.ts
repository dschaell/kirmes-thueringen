import type { APIRoute } from 'astro';
import { holeBeitragFoto } from '../../../../lib/api';

/** Foto eines Beitrags (Issue #352). Kennung ändert sich nie, daher lange cachebar. */
export const GET: APIRoute = async ({ params }) => {
  const groesse =
    params.groesse === 'klein' ? 'klein' : params.groesse === 'gross' ? 'gross' : null;
  const bild = groesse ? await holeBeitragFoto(params.id ?? '', groesse) : null;
  if (!bild) return new Response(null, { status: 404 });
  return new Response(bild, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
