import type { APIRoute } from 'astro';
import { adminApi, jsonAntwort, jsonBody } from '../../../lib/admin';

/** Speichert den neuen Passkey, nachdem die API die Antwort des Geräts geprüft hat. */
export const POST: APIRoute = async ({ cookies, request }) => {
  const body = await jsonBody(request);
  if (!body) return jsonAntwort(400, { fehler: 'Ungültige Anfrage.' });
  const r = await adminApi(cookies, 'POST', 'passkeys', {
    vorgang: body.vorgang,
    antwort: body.antwort,
    name: typeof body.name === 'string' ? body.name : '',
  });
  return jsonAntwort(r.status, r.status === 201 ? r.daten : { fehler: r.fehler.join(' ') });
};
