import type { APIRoute } from 'astro';
import { istTerminId, leseJson, verwaltung } from '../../../lib/api';

export const PUT: APIRoute = async ({ request, params }) => {
  if (!istTerminId(params.id)) return new Response(null, { status: 404 });
  const json = await leseJson(request);
  if (json instanceof Response) return json;
  return verwaltung('PUT', `termine/${params.id}`, request.headers.get('authorization'), {
    body: json.body,
  });
};

export const DELETE: APIRoute = ({ request, params }) =>
  istTerminId(params.id)
    ? verwaltung('DELETE', `termine/${params.id}`, request.headers.get('authorization'))
    : new Response(null, { status: 404 });
