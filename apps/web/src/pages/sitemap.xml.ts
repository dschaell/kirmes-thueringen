import type { APIRoute } from 'astro';
import { alleTermine, listeOrte } from '../lib/api';
import { LANDKREISE, heute, kreisSlug } from '../lib/anzeige';

/** Sitemap aus der Datenbank – Ortsseiten mit Terminen und kommende Terminseiten (Issue #110). */
export const GET: APIRoute = async ({ site }) => {
  const [orte, termine] = await Promise.all([listeOrte(), alleTermine({ von: heute() })]);
  // lastmod (Issue #182): Termin = letzte Änderung, Ort = jüngste Änderung seiner Termine
  // Issue #305: auch Landkreis- und Übersichtsseiten mit der jüngsten Änderung ihrer Termine
  const zuletzt = new Map<string, string>();
  const merke = (schluessel: string, tag: string) => {
    if (tag > (zuletzt.get(schluessel) ?? '')) zuletzt.set(schluessel, tag);
  };
  for (const t of termine) {
    const tag = t.geaendertAm?.slice(0, 10);
    if (!tag) continue;
    merke(t.ort.slug, tag);
    merke(`/kreise/${kreisSlug(t.ort.landkreis)}`, tag);
    merke('/', tag);
  }
  const eintraege: [pfad: string, lastmod?: string][] = [
    ...['/', '/termine', '/orte', '/kreise', '/karte'].map((p): [string, string?] => [
      p,
      zuletzt.get('/'),
    ]),
    ...Object.keys(LANDKREISE).map((k): [string, string?] => [
      `/kreise/${kreisSlug(k)}`,
      zuletzt.get(`/kreise/${kreisSlug(k)}`),
    ]),
    ...[
      '/termin-melden',
      '/redaktion-mitmachen',
      '/ueber-die-kirmes',
      '/muttizettel',
      '/kalender-abonnieren',
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
