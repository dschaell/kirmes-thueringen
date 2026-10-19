/** Verwaltung durch Kirmesgesellschaften per persönlichem Bearbeitungslink (Issue #199: aus app.ts). */
import type { TerminFormular, Validierungsfehler } from '@kirmes/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { problem, terminDto, bearer } from './antworten.js';
import type { AppAbhaengigkeiten } from './abhaengigkeiten.js';

const terminFormularSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['datum', 'titel'],
  properties: {
    version: { type: 'string', maxLength: 80 },
    datum: { type: 'string', maxLength: 10 },
    beginn: { type: ['string', 'null'], maxLength: 5 },
    titel: { type: 'string', maxLength: 200 },
    veranstaltungsort: { type: ['string', 'null'], maxLength: 120 },
    kategorie: { type: ['string', 'null'], maxLength: 20 },
    band: { type: ['string', 'null'], maxLength: 200 },
    pfarrer: { type: ['string', 'null'], maxLength: 120 },
    muttizettel: { type: 'boolean' },
    info: { type: ['string', 'null'], maxLength: 1000 },
  },
} as const;

const wochenendeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['zeilen'],
  properties: { zeilen: { type: 'array', minItems: 1, maxItems: 20, items: terminFormularSchema } },
} as const;

const idSchema = {
  type: 'object',
  properties: { id: { type: 'string', maxLength: 36 } },
} as const;

const festplatzSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'lat', 'lon'],
  properties: {
    name: { type: 'string', maxLength: 120 },
    lat: { type: 'number' },
    lon: { type: 'number' },
  },
} as const;

export function verwaltungRouten(app: FastifyInstance, d: AppAbhaengigkeiten) {
  // ── Verwaltung durch Kirmesgesellschaften (persönlicher Bearbeitungslink) ──────────────
  const nichtBerechtigt = (reply: FastifyReply) =>
    reply
      .status(401)
      .header('WWW-Authenticate', 'Bearer')
      .type('application/problem+json')
      .send(problem(401, 'Bearbeitungslink ungültig oder gesperrt'));

  app.get('/api/v1/verwaltung/festplaetze', async (req, reply) => {
    const r = await d.verwalteFestplaetze.uebersicht(bearer(req.headers.authorization));
    reply.header('Cache-Control', 'no-store');
    return r.ok ? r.value : nichtBerechtigt(reply);
  });

  app.put<{ Body: { name: string; lat: number; lon: number } }>(
    '/api/v1/verwaltung/festplaetze',
    { schema: { body: festplatzSchema } },
    async (req, reply) => {
      const r = await d.verwalteFestplaetze.speichere(bearer(req.headers.authorization), req.body);
      if (r.ok) return r.value;
      if (Array.isArray(r.error)) {
        return reply
          .status(400)
          .type('application/problem+json')
          .send(problem(400, 'Ungültiger Festplatz', { fehler: r.error }));
      }
      return nichtBerechtigt(reply);
    },
  );

  app.delete<{ Querystring: { name: string } }>(
    '/api/v1/verwaltung/festplaetze',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', maxLength: 120 } },
        },
      },
    },
    async (req, reply) => {
      const r = await d.verwalteFestplaetze.loesche(
        bearer(req.headers.authorization),
        req.query.name,
      );
      if (!r.ok) return nichtBerechtigt(reply);
      return r.value
        ? reply.status(204).send()
        : reply.status(404).send(problem(404, 'Festplatz nicht gefunden'));
    },
  );

  // ── Termine der Kirmesgesellschaft ─────────────────────────────────────────────────────
  const ungueltig = (reply: FastifyReply, fehler: Validierungsfehler[]) =>
    reply
      .status(400)
      .type('application/problem+json')
      .send(problem(400, 'Ungültiger Termin', { fehler }));

  app.get('/api/v1/verwaltung/termine', async (req, reply) => {
    const r = await d.verwalteTermine.liste(bearer(req.headers.authorization));
    reply.header('Cache-Control', 'no-store');
    return r.ok
      ? r.value.map((t) => ({ ...terminDto(t), version: t.version }))
      : nichtBerechtigt(reply);
  });

  app.post<{ Body: TerminFormular }>(
    '/api/v1/verwaltung/termine',
    { schema: { body: terminFormularSchema } },
    async (req, reply) => {
      const r = await d.verwalteTermine.lege(bearer(req.headers.authorization), req.body);
      if (r.ok)
        return reply
          .status(201)
          .send({ termin: terminDto(r.value.termin), hinweise: r.value.hinweise });
      return Array.isArray(r.error) ? ungueltig(reply, r.error) : nichtBerechtigt(reply);
    },
  );

  app.post<{ Body: { zeilen: TerminFormular[] } }>(
    '/api/v1/verwaltung/termine/wochenende',
    { schema: { body: wochenendeSchema } },
    async (req, reply) => {
      const r = await d.verwalteTermine.legeMehrere(
        bearer(req.headers.authorization),
        req.body.zeilen,
      );
      if (r.ok) {
        return reply
          .status(201)
          .send({ termine: r.value.termine.map(terminDto), hinweise: r.value.hinweise });
      }
      return Array.isArray(r.error) ? ungueltig(reply, r.error) : nichtBerechtigt(reply);
    },
  );

  app.put<{ Params: { id: string }; Body: TerminFormular }>(
    '/api/v1/verwaltung/termine/:id',
    { schema: { params: idSchema, body: terminFormularSchema } },
    async (req, reply) => {
      const r = await d.verwalteTermine.aendere(
        bearer(req.headers.authorization),
        req.params.id,
        req.body,
      );
      if (r.ok) return r.value;
      if (r.error === 'NICHT_GEFUNDEN') {
        return reply
          .status(404)
          .type('application/problem+json')
          .send(problem(404, 'Termin nicht gefunden'));
      }
      return Array.isArray(r.error) ? ungueltig(reply, r.error) : nichtBerechtigt(reply);
    },
  );

  app.post<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/v1/verwaltung/termine/:id/bestaetigen',
    {
      schema: {
        params: idSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { version: { type: 'string', maxLength: 80 } },
        },
      },
    },
    async (req, reply) => {
      const r = await d.verwalteTermine.bestaetige(
        bearer(req.headers.authorization),
        req.params.id,
        req.query.version,
      );
      if (!r.ok) return nichtBerechtigt(reply);
      return r.value
        ? reply.status(204).send()
        : reply.status(404).send(problem(404, 'Termin nicht gefunden'));
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/v1/verwaltung/termine/:id',
    {
      schema: {
        params: idSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { version: { type: 'string', maxLength: 80 } },
        },
      },
    },
    async (req, reply) => {
      const r = await d.verwalteTermine.loesche(
        bearer(req.headers.authorization),
        req.params.id,
        req.query.version,
      );
      if (!r.ok) return nichtBerechtigt(reply);
      return r.value
        ? reply.status(204).send()
        : reply.status(404).send(problem(404, 'Termin nicht gefunden'));
    },
  );
}
