/** Mitglieder und Einladungen – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import type { Rolle } from '@kirmes/core';
import { ID, objekt, TEXT, ungueltig } from './gemeinsam.js';
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
  // Name der Kirmesgesellschaft (Issue #246): Admin jeder Ort, KG der eigene – Use Case/Filter
  r.put<{ Params: { slug: string }; Body: { name: string } }>(
    '/api/v1/admin/orte/:slug/kirmesgesellschaft',
    {
      schema: {
        params: objekt(['slug'], { slug: TEXT(120) }),
        body: objekt(['name'], { name: TEXT(400) }),
      },
    },
    async (req, reply) => {
      const m = await v.setzeKgName(akteur(req), req.params.slug, req.body.name);
      if (!m.ok)
        return Array.isArray(m.error)
          ? ungueltig(reply, m.error)
          : verwaltungsFehler(reply, m.error);
      req.log.info({ akteur: admin(req), ort: req.params.slug }, 'Name der Kirmesgesellschaft');
      return { name: m.value };
    },
  );
  // Namen ändern (Issue #244): eigener Name jeder, fremde nur Admin – geprüft im Use Case
  r.put<{ Params: { id: string }; Body: { name: string } }>(
    '/api/v1/admin/mitglieder/:id/name',
    { schema: { params: ID, body: objekt(['name'], { name: TEXT(200) }) } },
    async (req, reply) => {
      const m = await v.benenneUm(akteur(req), req.params.id, req.body.name);
      if (!m.ok)
        return Array.isArray(m.error)
          ? ungueltig(reply, m.error)
          : verwaltungsFehler(reply, m.error);
      req.log.info({ akteur: admin(req), mitglied: req.params.id }, 'Name geändert');
      return { name: m.value };
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
