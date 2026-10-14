import type { APIRoute } from 'astro';
import { leseJson, verwaltung } from '../../lib/api';

export const GET: APIRoute = ({ request }) =>
  verwaltung('GET', 'termine', request.headers.get('authorization'));

export const POST: APIRoute = async ({ request }) => {
  const json = await leseJson(request);
  if (json instanceof Response) return json;
  return verwaltung('POST', 'termine', request.headers.get('authorization'), { body: json.body });
};
