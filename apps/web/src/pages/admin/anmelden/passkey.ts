import type { APIRoute } from 'astro';
import { adminApi, jsonAntwort, jsonBody, setzeSitzung } from '../../../lib/admin';

/**
 * Prüft die signierte Passkey-Antwort über die API und setzt bei Erfolg das Sitzungs-Cookie.
 * Das Sitzungs-Token erreicht nie das JavaScript der Seite.
 */
export const POST: APIRoute = async ({ cookies, request }) => {
  const body = await jsonBody(request);
  if (!body) return jsonAntwort(400, { fehler: 'Ungültige Anfrage.' });
  const r = await adminApi<{ token: string; stunden: number }>(
    cookies,
    'POST',
    'passkey-anmeldung',
    { vorgang: body.vorgang, antwort: body.antwort },
  );
  if (r.status === 200 && r.daten) {
    setzeSitzung(cookies, r.daten.token, r.daten.stunden);
    return jsonAntwort(200, { weiter: '/admin' });
  }
  return jsonAntwort(r.status, { fehler: r.fehler[0] ?? 'Anmeldung fehlgeschlagen.' });
};
