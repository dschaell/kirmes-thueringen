import type { APIRoute } from 'astro';
import { alleTermine } from '../lib/api';
import { heute, plusTage } from '../lib/anzeige';
import { alsIcal } from '../lib/ical';
import { aboAuswahl } from '../lib/kalenderabo';

/**
 * Kalender-Abo – ganz Thüringen, ?kreis=IK oder ?ort=alkersleben. Enthält auch die letzten 90 Tage,
 * damit vergangene Kirmes-Termine nicht aus den Kalendern der Abonnenten verschwinden (Issue #139).
 */
export const GET: APIRoute = async ({ site, url }) => {
  const abo = await aboAuswahl(url.searchParams);
  if (!abo) return new Response('Landkreis oder Ort unbekannt', { status: 404 });
  // Zwei Abfragen, weil die API höchstens 366 Tage je Anfrage liefert
  const h = heute();
  const [vergangen, kommend] = await Promise.all([
    alleTermine({ von: plusTage(h, -90), bis: plusTage(h, -1), ...abo.filter }),
    alleTermine({ von: h, bis: plusTage(h, 365), ...abo.filter }),
  ]);
  return new Response(alsIcal([...vergangen, ...kommend], site, abo.name), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
