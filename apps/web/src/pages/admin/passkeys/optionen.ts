import type { APIRoute } from 'astro';
import { adminApi, jsonAntwort } from '../../../lib/admin';

/** Challenge für einen neuen Passkey des angemeldeten Admins. */
export const POST: APIRoute = async ({ cookies }) => {
  const r = await adminApi(cookies, 'POST', 'passkeys/optionen', {});
  return jsonAntwort(r.status, r.status === 200 ? r.daten : { fehler: r.fehler[0] });
};
