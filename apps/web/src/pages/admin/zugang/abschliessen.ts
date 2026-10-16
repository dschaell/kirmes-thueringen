import type { APIRoute } from 'astro';
import { jsonAntwort, jsonBody, setzeSitzung } from '../../../lib/admin';
import { istToken, zugangAbschliessen } from '../../../lib/zugang';

/**
 * Prüft den neuen Passkey über die API und setzt bei Erfolg das Sitzungs-Cookie.
 * Das Sitzungs-Token erreicht nie das JavaScript der Seite.
 */
export const POST: APIRoute = async ({ cookies, request }) => {
  const b = await jsonBody(request);
  const art =
    b?.art === 'einladung' ? 'einladung' : b?.art === 'einrichtung' ? 'einrichtung' : null;
  if (!b || !art || !istToken(String(b.token ?? '')) || typeof b.vorgang !== 'string') {
    return jsonAntwort(400, { fehler: 'Ungültige Anfrage.' });
  }
  const r = await zugangAbschliessen(art, String(b.token), b.vorgang, b.antwort);
  if ('token' in r) {
    setzeSitzung(cookies, r.token, r.stunden);
    return jsonAntwort(200, { weiter: '/admin/passkeys?willkommen=1' });
  }
  return jsonAntwort(r.status, { fehler: r.fehler });
};
