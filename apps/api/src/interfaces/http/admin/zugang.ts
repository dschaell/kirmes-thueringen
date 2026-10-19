/** Anmeldung, Ersteinrichtung, Einladung (ohne Sitzung) – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import { problem, ungueltig, nichtGefunden, objekt, TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function zugangRouten(app: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { TOKEN, REGISTRIERUNG, keinCache, registrierungsFehler } = k;
  // ── Anmeldung mit Passkey (ohne Sitzung) ──────────────────────────────────────────────
  const passkeys = d.passkeys;
  if (passkeys) {
    app.post('/api/v1/admin/passkey-anmeldung/optionen', async (_req, reply) => {
      keinCache(reply);
      return passkeys.starteAnmeldung();
    });
    app.post<{ Body: { vorgang: string; antwort: unknown } }>(
      '/api/v1/admin/passkey-anmeldung',
      { bodyLimit: 64 * 1024, schema: { body: REGISTRIERUNG } },
      async (req, reply) => {
        const r = await passkeys.beendeAnmeldung(req.body.vorgang, req.body.antwort);
        keinCache(reply);
        if (r.ok) return r.value;
        req.log.warn({ grund: r.error }, 'Passkey-Anmeldung fehlgeschlagen');
        return r.error === 'GESPERRT'
          ? reply
              .status(429)
              .header('Retry-After', '900')
              .send(problem(429, 'Zu viele Fehlversuche – bitte 15 Minuten warten.'))
          : reply.status(401).send(problem(401, 'Dieser Passkey ist hier nicht eingerichtet.'));
      },
    );
  }

  // ── Ersten Admin einrichten (ohne Sitzung, nur solange es keinen Admin gibt) ─────────
  const einrichtung = d.einrichtung;
  const LINK = { type: 'object', properties: { link: TOKEN } } as const;

  app.get('/api/v1/admin/einrichtung', async (_req, reply) => {
    keinCache(reply);
    return { offen: einrichtung ? await einrichtung.offen() : false, moeglich: !!einrichtung };
  });
  app.post('/api/v1/admin/einrichtung', async (req, reply) => {
    keinCache(reply);
    if (!einrichtung) {
      return reply.status(503).send(problem(503, 'E-Mail-Versand ist nicht eingerichtet.'));
    }
    try {
      const r = await einrichtung.sendeLink();
      if (r.ok) return reply.status(202).send({ verschickt: true });
      return registrierungsFehler(reply, r.error);
    } catch (e) {
      req.log.error({ err: e }, 'Einrichtungslink konnte nicht versendet werden');
      return reply
        .status(502)
        .send(problem(502, 'Die E-Mail konnte gerade nicht versendet werden.'));
    }
  });
  app.get<{ Params: { link: string } }>(
    '/api/v1/admin/einrichtung/:link',
    { schema: { params: LINK } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.pruefeLink(req.params.link);
      return r.ok ? { gueltig: true } : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { link: string }; Body: { name: string } }>(
    '/api/v1/admin/einrichtung/:link/optionen',
    { schema: { params: LINK, body: objekt(['name'], { name: TEXT(200) }) } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.starte(req.params.link, req.body.name);
      if (r.ok) return r.value;
      return Array.isArray(r.error)
        ? ungueltig(reply, r.error)
        : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { link: string }; Body: { vorgang: string; antwort: unknown } }>(
    '/api/v1/admin/einrichtung/:link',
    { bodyLimit: 64 * 1024, schema: { params: LINK, body: REGISTRIERUNG } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.schliesseAb(req.params.link, req.body.vorgang, req.body.antwort);
      if (!r.ok) return registrierungsFehler(reply, r.error);
      req.log.info('Erster Admin eingerichtet');
      return r.value;
    },
  );

  // ── Einladung annehmen (ohne Sitzung) ─────────────────────────────────────────────────
  const beitritt = d.beitritt;
  const EINLADUNG = { type: 'object', properties: { token: TOKEN } } as const;
  app.get<{ Params: { token: string } }>(
    '/api/v1/admin/einladung/:token',
    { schema: { params: EINLADUNG } },
    async (req, reply) => {
      keinCache(reply);
      const r = beitritt ? await beitritt.pruefe(req.params.token) : null;
      return r?.ok ? r.value : registrierungsFehler(reply, 'ABGELAUFEN');
    },
  );
  app.post<{ Params: { token: string }; Body: { name: string } }>(
    '/api/v1/admin/einladung/:token/optionen',
    { schema: { params: EINLADUNG, body: objekt(['name'], { name: TEXT(200) }) } },
    async (req, reply) => {
      keinCache(reply);
      if (!beitritt) return nichtGefunden(reply);
      const r = await beitritt.starte(req.params.token, req.body.name);
      if (r.ok) return r.value;
      return Array.isArray(r.error)
        ? ungueltig(reply, r.error)
        : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { token: string }; Body: { vorgang: string; antwort: unknown } }>(
    '/api/v1/admin/einladung/:token',
    { bodyLimit: 64 * 1024, schema: { params: EINLADUNG, body: REGISTRIERUNG } },
    async (req, reply) => {
      keinCache(reply);
      if (!beitritt) return nichtGefunden(reply);
      const r = await beitritt.beende(req.params.token, req.body.vorgang, req.body.antwort);
      if (!r.ok) return registrierungsFehler(reply, r.error);
      req.log.info('Neues Mitglied über Einladung');
      return { token: r.value.token, stunden: r.value.stunden };
    },
  );
}
