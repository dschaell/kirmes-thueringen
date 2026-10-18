import type { APIRoute } from 'astro';
import { alleTermine } from '../lib/api';
import { heute } from '../lib/anzeige';
import { alsIcal } from '../lib/ical';
import { aboAuswahl } from '../lib/kalenderabo';

/** Kalender-Abo aller kommenden Termine – ganz Thüringen, ?kreis=IK oder ?ort=alkersleben. */
export const GET: APIRoute = async ({ site, url }) => {
  const abo = await aboAuswahl(url.searchParams);
  if (!abo) return new Response('Landkreis oder Ort unbekannt', { status: 404 });
  return new Response(alsIcal(await alleTermine({ von: heute(), ...abo.filter }), site, abo.name), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
