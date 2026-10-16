import type { APIRoute } from 'astro';
import { jsonAntwort, jsonBody } from '../../../lib/admin';
import { istToken, zugangsOptionen } from '../../../lib/zugang';

/** Passkey-Optionen für Ersteinrichtung bzw. Einladung (ohne Sitzung; CSRF prüft die Middleware). */
export const POST: APIRoute = async ({ request }) => {
  const b = await jsonBody(request);
  const art =
    b?.art === 'einladung' ? 'einladung' : b?.art === 'einrichtung' ? 'einrichtung' : null;
  if (!b || !art || !istToken(String(b.token ?? '')) || typeof b.name !== 'string') {
    return jsonAntwort(400, { fehler: 'Ungültige Anfrage.' });
  }
  const r = await zugangsOptionen(art, String(b.token), b.name.slice(0, 200));
  return r.ok ? jsonAntwort(200, r.daten) : jsonAntwort(r.status, { fehler: r.fehler });
};
