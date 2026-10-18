import type { APIRoute } from 'astro';
import { alleTermine, listeOrte } from '../lib/api';
import { LANDKREISE, heute, kreisSlug } from '../lib/anzeige';

/** Sitemap aus der Datenbank – Ortsseiten mit Terminen und kommende Terminseiten (Issue #110). */
export const GET: APIRoute = async ({ site }) => {
  const [orte, termine] = await Promise.all([listeOrte(), alleTermine({ von: heute() })]);
  const pfade = [
    '/',
    '/termine',
    '/orte',
    '/kreise',
    '/termin-melden',
    '/redaktion-mitmachen',
    '/ueber-die-kirmes',
    '/muttizettel',
    '/karte',
    '/kalender-abonnieren',
    ...Object.keys(LANDKREISE).map((k) => `/kreise/${kreisSlug(k)}`),
    ...orte.filter((o) => o.anzahlKommend > 0).map((o) => `/orte/${o.slug}`),
    ...termine.map((t) => `/termin/${t.id}`),
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
