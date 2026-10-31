import type { APIRoute } from 'astro';
import { leseJson, pushAnApi } from '../../lib/api';

/**
 * Push-Abo anlegen/ändern (PUT) oder abmelden (DELETE), Issue #348. Nur von der eigenen Seite:
 * Browser senden bei fetch immer einen Origin – fehlt er oder ist er fremd, gibt es nichts.
 */
function eigeneSeite(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return !!origin && new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function weiter(request: Request, methode: 'PUT' | 'DELETE') {
  if (!eigeneSeite(request)) return new Response(null, { status: 403 });
  // bis zu 100 gemerkte Termine + 50 Orte
  const json = await leseJson(request, 16_384);
  if (json instanceof Response) return json;
  return pushAnApi(methode, 'abo', json.body);
}

export const PUT: APIRoute = ({ request }) => weiter(request, 'PUT');
export const DELETE: APIRoute = ({ request }) => weiter(request, 'DELETE');
