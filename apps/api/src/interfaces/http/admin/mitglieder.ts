/** Mitglieder und Einladungen – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import type { Rolle } from '@kirmes/core';
import { ID, objekt, TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function mitgliederRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { admin, akteur, verwaltungsFehler } = k;
  // Mitglieder und Einladungen (nur Admin – geprüft im Use Case)
  const v = d.mitglieder;
  const ROLLE = {
    type: 'string',
    enum: ['admin', 'redaktion', 'kirmesgesellschaft'],
  } as const;
  r.get('/api/v1/admin/mitglieder', async (req, reply) => {
    const m = await v.liste(akteur(req));
    return m.ok ? m.value : verwaltungsFehler(reply, m.error);
  });
  r.put<{ Params: { id: string }; Body: { rolle: Rolle } }>(
    '/api/v1/admin/mitglieder/:id/rolle',
    { schema: { params: ID, body: objekt(['rolle'], { rolle: ROLLE, bezeichnung: TEXT(200) }) } },
    async (req, reply) => {
      const m = await v.setzeRolle(akteur(req), req.params.id, req.body.rolle);
      if (!m.ok) return verwaltungsFehler(reply, m.error);
      req.log.info(
        { akteur: admin(req), mitglied: req.params.id, rolle: req.body.rolle },
        'Rolle geändert',
      );
      return reply.status(204).send();
    },
  );
  r.delete<{ Params: { id: string } }>(
    '/api/v1/admin/mitglieder/:id',
    { schema: { params: ID } },
    async (req, reply) => {
      const m = await v.entferne(akteur(req), req.params.id);
      if (!m.ok) return verwaltungsFehler(reply, m.error);
      req.log.info({ akteur: admin(req), mitglied: req.params.id }, 'Mitglied entfernt');
      return reply.status(204).send();
    },
  );
  r.get('/api/v1/admin/einladungen', async (req, reply) => {
    const m = await v.offeneEinladungen(akteur(req));
    return m.ok ? m.value : verwaltungsFehler(reply, m.error);
  });
  r.post<{ Body: { rolle: Rolle; bezeichnung?: string; ortSlug?: string } }>(
    '/api/v1/admin/einladungen',
    {
      schema: {
        body: objekt(['rolle'], { rolle: ROLLE, bezeichnung: TEXT(200), ortSlug: TEXT(120) }),
      },
    },
    async (req, reply) => {
      const m = await v.lade(akteur(req), req.body.rolle, req.body.bezeichnung, req.body.ortSlug);
      if (!m.ok) return verwaltungsFehler(reply, m.error);
      // Das Token selbst wird nie geloggt
      req.log.info(
        { akteur: admin(req), einladung: m.value.id, rolle: m.value.rolle },
        'Einladung erstellt',
      );
      return reply.status(201).send(m.value);
    },
  );
  r.delete<{ Params: { id: string } }>(
    '/api/v1/admin/einladungen/:id',
    { schema: { params: ID } },
    async (req, reply) => {
      const m = await v.widerrufe(akteur(req), req.params.id);
      if (!m.ok) return verwaltungsFehler(reply, m.error);
      req.log.info({ akteur: admin(req), einladung: req.params.id }, 'Einladung widerrufen');
      return reply.status(204).send();
    },
  );
}
