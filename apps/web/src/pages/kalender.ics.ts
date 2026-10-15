import type { APIRoute } from 'astro';
import { alleTermine } from '../lib/api';
import { heute } from '../lib/anzeige';
import { alsIcal } from '../lib/ical';

/** Kalender-Abo aller kommenden Termine (12 Monate). */
export const GET: APIRoute = async ({ site }) =>
  new Response(alsIcal(await alleTermine({ von: heute() }), site, 'Kirmeskalender Thüringen'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
