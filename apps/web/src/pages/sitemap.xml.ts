import type { APIRoute } from 'astro';
import { listeOrte } from '../lib/api';
import { LANDKREISE, kreisSlug } from '../lib/anzeige';

/** Sitemap aus der Datenbank – enthält jede Ortsseite, auch neu angelegte Orte. */
export const GET: APIRoute = async ({ site }) => {
  const orte = await listeOrte();
  const pfade = [
    '/',
    '/termine',
    '/orte',
    '/kreise',
    '/termin-melden',
    '/ueber-die-kirmes',
    '/muttizettel',
    ...Object.keys(LANDKREISE).map((k) => `/kreise/${kreisSlug(k)}`),
    ...orte.filter((o) => o.anzahlKommend > 0).map((o) => `/orte/${o.slug}`),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pfade.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
