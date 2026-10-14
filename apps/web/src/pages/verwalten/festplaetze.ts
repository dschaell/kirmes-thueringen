import type { APIRoute } from 'astro';
import { leseJson, verwaltung } from '../../lib/api';

/** Same-Origin-Endpunkte der Bearbeitungsseite → interne API. Token kommt im Authorization-Header. */
export const GET: APIRoute = ({ request }) =>
  verwaltung('GET', 'festplaetze', request.headers.get('authorization'));

export const PUT: APIRoute = async ({ request }) => {
  const json = await leseJson(request);
  if (json instanceof Response) return json;
  return verwaltung('PUT', 'festplaetze', request.headers.get('authorization'), {
    body: json.body,
  });
};

export const DELETE: APIRoute = ({ request, url }) =>
  verwaltung('DELETE', 'festplaetze', request.headers.get('authorization'), {
    query: { name: url.searchParams.get('name') ?? '' },
  });
