import type { APIRoute } from 'astro';
import { istTerminId, verwaltung } from '../../../../lib/api';

export const POST: APIRoute = ({ request, params }) =>
  istTerminId(params.id)
    ? verwaltung('POST', `termine/${params.id}/bestaetigen`, request.headers.get('authorization'))
    : new Response(null, { status: 404 });
