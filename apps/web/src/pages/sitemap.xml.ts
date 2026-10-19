import type { APIRoute } from 'astro';
import { alleTermine, listeOrte } from '../lib/api';
import { LANDKREISE, heute, kreisSlug } from '../lib/anzeige';

/** Sitemap aus der Datenbank – Ortsseiten mit Terminen und kommende Terminseiten (Issue #110). */
export const GET: APIRoute = async ({ site }) => {
  const [orte, termine] = await Promise.all([listeOrte(), alleTermine({ von: heute() })]);
  // lastmod (Issue #182): Termin = letzte Änderung, Ort = jüngste Änderung seiner Termine
  const zuletzt = new Map<string, string>();
  for (const t of termine) {
    const tag = t.geaendertAm?.slice(0, 10);
    if (tag && tag > (zuletzt.get(t.ort.slug) ?? '')) zuletzt.set(t.ort.slug, tag);
  }
  const eintraege: [pfad: string, lastmod?: string][] = [
    ...[
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
    ].map((p): [string] => [p]),
    ...orte
      .filter((o) => o.anzahlKommend > 0)
      .map((o): [string, string?] => [`/orte/${o.slug}`, zuletzt.get(o.slug)]),
    ...termine.map((t): [string, string?] => [`/termin/${t.id}`, t.geaendertAm?.slice(0, 10)]),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    eintraege
      .map(
        ([p, m]) =>
          `  <url><loc>${new URL(p, site).href}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n';
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
