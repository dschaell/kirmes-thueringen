/** Mitmach-Anfragen annehmen oder ablehnen (Issue #279) – nur Admin, geprüft im Use Case. */
import type { Rolle } from '@kirmes/core';
import type { FastifyInstance } from 'fastify';
import { ID, objekt, problem, TEXT, type AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function anfragenRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const a = d.anfragen;
  if (!a) return;
  const { admin, akteur, verwaltungsFehler } = k;
  const fehler = (reply: Parameters<typeof verwaltungsFehler>[0], e: string) =>
    e === 'ERLEDIGT'
      ? reply.status(409).send(problem(409, 'Diese Anfrage wurde schon bearbeitet.'))
      : e === 'VERSAND'
        ? reply
            .status(502)
            .send(problem(502, 'Die E-Mail konnte nicht gesendet werden. Bitte später erneut.'))
        : verwaltungsFehler(reply, e);
  r.get('/api/v1/admin/anfragen', async (req, reply) => {
    const m = await a.liste(akteur(req));
    return m.ok ? m.value : fehler(reply, m.error);
  });
  r.post<{ Params: { id: string }; Body: { rolle: Rolle; ortSlug?: string } }>(
    '/api/v1/admin/anfragen/:id/annehmen',
    {
      schema: {
        params: ID,
        body: objekt(['rolle'], {
          rolle: { type: 'string', enum: ['redaktion', 'kirmesgesellschaft'] },
          ortSlug: TEXT(120),
        }),
      },
    },
    async (req, reply) => {
      const m = await a.nimmAn(akteur(req), req.params.id, req.body.rolle, req.body.ortSlug);
      if (!m.ok) return fehler(reply, m.error);
      req.log.info(
        { akteur: admin(req), anfrage: req.params.id, rolle: req.body.rolle },
        'Mitmach-Anfrage angenommen',
      );
      return m.value;
    },
  );
  r.post<{ Params: { id: string } }>(
    '/api/v1/admin/anfragen/:id/ablehnen',
    { schema: { params: ID } },
    async (req, reply) => {
      const m = await a.lehneAb(akteur(req), req.params.id);
      if (!m.ok) return fehler(reply, m.error);
      req.log.info({ akteur: admin(req), anfrage: req.params.id }, 'Mitmach-Anfrage abgelehnt');
      return reply.status(204).send();
    },
  );
}
