import type { APIRoute } from 'astro';
import { alleTermine } from '../lib/api';
import { wochenende, wochentag, zeitraumKurz } from '../lib/anzeige';
import { wochenbildPng, type Wochenformat } from '../lib/wochenbild';

/** Wochenbild zum Teilen (Issue #308): ?format=story für Status/Story, sonst Beitrag. */
export const GET: APIRoute = async ({ url }) => {
  const format: Wochenformat = url.searchParams.get('format') === 'story' ? 'story' : 'beitrag';
  const { von, bis } = wochenende();
  const termine = (await alleTermine({ von, bis })).map((t) => ({
    wann: `${wochentag(t.datum).slice(0, 2)}.${t.beginn ? ` ${t.beginn}` : ''}`,
    titel: t.titel,
    ort: t.ort.name,
  }));
  return new Response(wochenbildPng(zeitraumKurz(von, bis), termine, format), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=1800',
      'Content-Disposition': `inline; filename="kirmes-wochenende-${von}${format === 'story' ? '-story' : ''}.png"`,
    },
  });
};
