/** Mitteilungen – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import type { MitteilungEingabe } from '@kirmes/core';
import { ungueltig, nichtGefunden, ID, objekt, TEXT, OPT_TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function mitteilungenRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { admin } = k;
  // Mitteilungen
  r.get('/api/v1/admin/mitteilungen', () => d.redaktion.listeMitteilungen());
  r.post<{ Body: MitteilungEingabe & { sofort?: boolean } }>(
    '/api/v1/admin/mitteilungen',
    {
      schema: {
        body: objekt(['titel', 'text'], {
          titel: TEXT(200),
          text: TEXT(4000),
          link: OPT_TEXT(500),
          sofort: { type: 'boolean' },
        }),
      },
    },
    async (req, reply) => {
      const m = await d.redaktion.legeMitteilung(req.body, admin(req));
      if (!m.ok) return ungueltig(reply, m.error);
      if (req.body.sofort) await d.redaktion.veroeffentliche(m.value.id, true);
      return reply.status(201).send(m.value);
    },
  );
  // Bearbeiten (Issue #261) – Kirmesgesellschaften kommen nicht heran (nicht in KG_ROUTEN)
  r.put<{ Params: { id: string }; Body: MitteilungEingabe }>(
    '/api/v1/admin/mitteilungen/:id',
    {
      schema: {
        params: ID,
        body: objekt(['titel', 'text'], {
          titel: TEXT(200),
          text: TEXT(4000),
          link: OPT_TEXT(500),
        }),
      },
    },
    async (req, reply) => {
      const m = await d.redaktion.aendereMitteilung(req.params.id, req.body);
      if (!m.ok) return ungueltig(reply, m.error);
      return m.value ?? nichtGefunden(reply);
    },
  );
  r.post<{ Params: { id: string }; Body: { an: boolean } }>(
    '/api/v1/admin/mitteilungen/:id/veroeffentlichen',
    { schema: { params: ID, body: objekt(['an'], { an: { type: 'boolean' } }) } },
    async (req, reply) =>
      (await d.redaktion.veroeffentliche(req.params.id, req.body.an))
        ? reply.status(204).send()
        : nichtGefunden(reply),
  );
  r.delete<{ Params: { id: string } }>(
    '/api/v1/admin/mitteilungen/:id',
    { schema: { params: ID } },
    async (req, reply) =>
      (await d.redaktion.loescheMitteilung(req.params.id))
        ? reply.status(204).send()
        : nichtGefunden(reply),
  );
}
