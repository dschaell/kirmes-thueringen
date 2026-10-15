import type { APIRoute } from 'astro';
import { adminApi, jsonAntwort } from '../../../lib/admin';

/** Challenge für die Anmeldung mit Passkey (ohne Sitzung). */
export const POST: APIRoute = async ({ cookies }) => {
  const r = await adminApi(cookies, 'POST', 'passkey-anmeldung/optionen', {});
  return r.status === 200
    ? jsonAntwort(200, r.daten)
    : jsonAntwort(r.status, { fehler: 'Passkeys sind hier nicht eingerichtet.' });
};
