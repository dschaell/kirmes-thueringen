import type { Vorschlaege, VorschlagEingabe } from '@kirmes/core';
import type { FastifyInstance, FastifyReply } from 'fastify';

const text = (maxLength: number) => ({ type: 'string', maxLength });
export const vorschlagsZeileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['datum', 'titel'],
  properties: {
    datum: text(10),
    beginn: { type: ['string', 'null'], maxLength: 5 },
    titel: text(200),
    veranstaltungsort: { type: ['string', 'null'], maxLength: 120 },
    band: { type: ['string', 'null'], maxLength: 120 },
    pfarrer: { type: ['string', 'null'], maxLength: 120 },
    info: { type: ['string', 'null'], maxLength: 500 },
    muttizettel: { type: 'boolean' },
    kategorie: {
      type: ['string', 'null'],
      enum: [
        'tanz',
        'party',
        'familie',
        'tradition',
        'fruehschoppen',
        'staendchen',
        'sonstiges',
        null,
      ],
    },
    speisen: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'preis'],
        properties: { name: text(120), preis: text(20) },
      },
    },
    // Issue #169: öffentlich nur der Link (wird geprüft, nie gespeichert); die Redaktion schickt
    // den gespeicherten Punkt zurück. Öffentlich gesendete Punkte ignoriert der Core.
    karte: text(2000),
    platz: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['lat', 'lon'],
      properties: { lat: { type: 'number' }, lon: { type: 'number' } },
    },
    platzUebernehmen: { type: 'boolean' },
  },
} as const;
const eingabe = {
  ortSlug: text(120),
  zeilen: { type: 'array', minItems: 1, maxItems: 20, items: vorschlagsZeileSchema },
  kontaktName: text(120),
  kontaktEmail: text(200),
  nachricht: text(2000),
};
const body = {
  type: 'object',
  additionalProperties: false,
  required: ['ortSlug', 'zeilen'],
  properties: { ...eingabe, falle: text(500), dauerMs: { type: 'integer', minimum: 0 } },
};
const params = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: text(36) },
};
const token = (h: string | undefined) => (h?.startsWith('Sitzung ') ? h.slice(8).trim() : '');
function fehler(reply: FastifyReply, e: unknown) {
  const status =
    e === 'KONFLIKT'
      ? 409
      : Array.isArray(e)
        ? 400
        : e === 'VERBOTEN'
          ? 403
          : e === 'NICHT_GEFUNDEN'
            ? 404
            : 429;
  return reply.status(status).send({
    status,
    title:
      status === 409
        ? 'Ein Termin mit diesem Titel und Datum existiert bereits. Bitte ändere den Vorschlag.'
        : status === 429
          ? 'Zu viele Vorschläge – bitte später erneut versuchen.'
          : status === 404
            ? 'Vorschlag nicht gefunden oder bereits bearbeitet.'
            : status === 403
              ? 'Bitte als Redaktion anmelden.'
              : 'Bitte Angaben prüfen.',
    ...(Array.isArray(e) ? { fehler: e } : {}),
  });
}
export async function vorschlagRouten(
  app: FastifyInstance,
  v: Vorschlaege,
  herkunft: (ip: string | undefined, weiter: unknown, ipFallback: string) => string,
) {
  app.post<{ Body: VorschlagEingabe }>(
    '/api/v1/vorschlaege',
    {
      bodyLimit: 256 * 1024,
      schema: { body },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const r = await v.melde(
        req.body,
        herkunft(req.socket.remoteAddress, req.headers['x-kirmes-client-ip'], req.ip),
      );
      return r.ok ? reply.status(202).send(r.value) : fehler(reply, r.error);
    },
  );
  await app.register(async (r) => {
    r.addHook('onRequest', async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const a = await v.anzahl(token(req.headers.authorization));
      if (!a.ok) return fehler(reply, a.error);
    });
    r.get('/api/v1/admin/termine-vorschlaege', async (req, reply) => {
      const a = await v.liste(token(req.headers.authorization));
      return a.ok ? a.value : fehler(reply, a.error);
    });
    r.get('/api/v1/admin/termine-vorschlaege/anzahl', async (req, reply) => {
      const a = await v.anzahl(token(req.headers.authorization));
      return a.ok ? { anzahl: a.value } : fehler(reply, a.error);
    });
    r.get<{ Params: { id: string } }>(
      '/api/v1/admin/termine-vorschlaege/:id',
      { schema: { params } },
      async (req, reply) => {
        const a = await v.finde(token(req.headers.authorization), req.params.id);
        return a.ok ? a.value : fehler(reply, a.error);
      },
    );
    r.post<{ Params: { id: string }; Body: VorschlagEingabe }>(
      '/api/v1/admin/termine-vorschlaege/:id/uebernehmen',
      {
        bodyLimit: 256 * 1024,
        schema: {
          params,
          // „bestaetigt“ bestimmt der Use Case aus der Rolle (Issue #240) – vom Browser ignoriert
          body: { ...body, properties: { ...eingabe, bestaetigt: { type: 'boolean' } } },
        },
      },
      async (req, reply) => {
        const a = await v.uebernehme(token(req.headers.authorization), req.params.id, req.body);
        return a.ok ? reply.status(204).send() : fehler(reply, a.error);
      },
    );
    r.post<{ Params: { id: string }; Body: { grund?: string } }>(
      '/api/v1/admin/termine-vorschlaege/:id/ablehnen',
      {
        schema: {
          params,
          body: { type: 'object', additionalProperties: false, properties: { grund: text(500) } },
        },
      },
      async (req, reply) => {
        const a = await v.lehneAb(token(req.headers.authorization), req.params.id, req.body.grund);
        return a.ok ? reply.status(204).send() : fehler(reply, a.error);
      },
    );
  });
}
