import type { Benachrichtigungen, PushFehler } from '@kirmes/core';
import { PUSH_MAX_ORTE, PUSH_MAX_TERMINE } from '@kirmes/core';
import type { FastifyInstance } from 'fastify';
import { problem } from './antworten.js';

/** Push-Abos (Issue #348) – öffentlich, je Gerät; ohne VAPID-Schlüssel nicht registriert. */
export interface PushAbhaengigkeiten {
  benachrichtigungen: Benachrichtigungen;
  /** Öffentlicher VAPID-Schlüssel für den Browser */
  oeffentlich: string;
}

const T = (n: number) => ({ type: 'string', minLength: 1, maxLength: n });
const endpunkt = T(1000);
const abo = {
  type: 'object',
  additionalProperties: false,
  required: ['endpoint', 'keys', 'orte', 'termine'],
  properties: {
    endpoint: endpunkt,
    keys: {
      type: 'object',
      additionalProperties: false,
      required: ['p256dh', 'auth'],
      properties: { p256dh: T(200), auth: T(100) },
    },
    orte: { type: 'array', maxItems: PUSH_MAX_ORTE, items: T(80) },
    termine: { type: 'array', maxItems: PUSH_MAX_TERMINE, items: T(36) },
    erinnerung: { type: 'boolean' },
  },
};
const MELDUNG: Record<PushFehler, string> = {
  ENDPUNKT: 'Unbekannter Push-Dienst.',
  SCHLUESSEL: 'Ungültige Schlüssel.',
  LISTE: 'Ungültige Orte oder Termine.',
};

export async function pushRouten(app: FastifyInstance, p: PushAbhaengigkeiten) {
  await app.register(async (r) => {
    r.addHook('onRequest', async (_req, reply) => {
      reply.header('Cache-Control', 'no-store');
    });
    const grenze = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

    r.get('/api/v1/push/schluessel', grenze, async () => ({ oeffentlich: p.oeffentlich }));

    r.put<{
      Body: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        orte: string[];
        termine: string[];
        erinnerung?: boolean;
      };
    }>(
      '/api/v1/push/abo',
      { ...grenze, bodyLimit: 16 * 1024, schema: { body: abo } },
      async (req, reply) => {
        const b = req.body;
        const e = await p.benachrichtigungen.abonniere({
          endpoint: b.endpoint,
          p256dh: b.keys.p256dh,
          auth: b.keys.auth,
          orte: b.orte,
          termine: b.termine,
          erinnerung: b.erinnerung ?? true,
        });
        return e.ok
          ? reply.status(204).send()
          : reply
              .status(400)
              .type('application/problem+json')
              .send(problem(400, MELDUNG[e.error], { code: e.error }));
      },
    );

    r.delete<{ Body: { endpoint: string } }>(
      '/api/v1/push/abo',
      {
        ...grenze,
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['endpoint'],
            properties: { endpoint: endpunkt },
          },
        },
      },
      async (req, reply) => {
        await p.benachrichtigungen.abmelden(req.body.endpoint);
        return reply.status(204).send();
      },
    );
  });
}
