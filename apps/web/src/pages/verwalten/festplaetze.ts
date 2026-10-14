import type { APIRoute } from 'astro';
import { verwaltung } from '../../lib/api';

/** Same-Origin-Endpunkte der Bearbeitungsseite → interne API. Token kommt im Authorization-Header. */
const MAX_BODY = 4_096;

export const GET: APIRoute = ({ request }) =>
  verwaltung('GET', request.headers.get('authorization'));

export const PUT: APIRoute = async ({ request }) => {
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  return verwaltung('PUT', request.headers.get('authorization'), { body });
};

export const DELETE: APIRoute = ({ request, url }) =>
  verwaltung('DELETE', request.headers.get('authorization'), {
    name: url.searchParams.get('name') ?? '',
  });
