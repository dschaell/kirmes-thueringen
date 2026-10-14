import type { APIRoute } from 'astro';
import { findeTermin } from '../../lib/api';
import { alsIcal } from '../../lib/ical';

/** Einzelner Termin als .ics – „In Kalender eintragen“ auf der Terminseite. */
export const GET: APIRoute = async ({ params, site }) => {
  const t = await findeTermin(params.id ?? '');
  if (!t) return new Response('Termin nicht gefunden', { status: 404 });
  return new Response(alsIcal([t], site, 'Kirmeskalender Thüringen'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="kirmes-${t.ort.slug}-${t.datum}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
