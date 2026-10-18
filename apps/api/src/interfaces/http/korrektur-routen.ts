import type { KorrekturEingabe, Korrekturen } from '@kirmes/core';
import type { FastifyInstance, FastifyReply } from 'fastify';

const text = (maxLength: number) => ({ type: 'string', maxLength });
const id = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: text(36) },
};
const body = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: text(2000),
    kontaktName: text(120),
    kontaktEmail: text(200),
    falle: text(500),
    dauerMs: { type: 'integer', minimum: 0 },
  },
};
const token = (h: string | undefined) => (h?.startsWith('Sitzung ') ? h.slice(8).trim() : '');
function fehler(reply: FastifyReply, e: unknown) {
  const status = Array.isArray(e)
    ? 400
    : e === 'VERBOTEN'
      ? 403
      : e === 'NICHT_GEFUNDEN'
        ? 404
        : 429;
  return reply.status(status).send({
    status,
    title:
      status === 429
        ? 'Zu viele Hinweise – bitte später erneut versuchen.'
        : status === 404
          ? 'Termin oder Hinweis nicht gefunden.'
          : status === 403
            ? 'Bitte als Redaktion anmelden.'
            : 'Bitte Angaben prüfen.',
    ...(Array.isArray(e) ? { fehler: e } : {}),
  });
}

/** Korrekturhinweise (Issue #107): öffentlich melden, Redaktion liest und erledigt. */
export async function korrekturRouten(
  app: FastifyInstance,
  k: Korrekturen,
  herkunft: (ip: string | undefined, weiter: unknown, ipFallback: string) => string,
) {
  app.post<{ Params: { id: string }; Body: KorrekturEingabe }>(
    '/api/v1/termine/:id/korrekturen',
    {
      schema: { params: id, body },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const r = await k.melde(
        req.params.id,
        req.body,
        herkunft(req.socket.remoteAddress, req.headers['x-kirmes-client-ip'], req.ip),
      );
      return r.ok ? reply.status(202).send(r.value) : fehler(reply, r.error);
    },
  );
  await app.register(async (r) => {
    r.addHook('onRequest', async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const a = await k.anzahl(token(req.headers.authorization));
      if (!a.ok) return fehler(reply, a.error);
    });
    r.get('/api/v1/admin/korrekturen', async (req, reply) => {
      const a = await k.liste(token(req.headers.authorization));
      return a.ok ? a.value : fehler(reply, a.error);
    });
    r.get('/api/v1/admin/korrekturen/anzahl', async (req, reply) => {
      const a = await k.anzahl(token(req.headers.authorization));
      return a.ok ? { anzahl: a.value } : fehler(reply, a.error);
    });
    r.post<{ Params: { id: string } }>(
      '/api/v1/admin/korrekturen/:id/erledigt',
      { schema: { params: id } },
      async (req, reply) => {
        const a = await k.erledige(token(req.headers.authorization), req.params.id);
        return a.ok ? reply.status(204).send() : fehler(reply, a.error);
      },
    );
  });
}
