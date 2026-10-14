/**
 * Redaktions-API (/api/v1/admin/*). Jeder Endpunkt außer „anmelden“ verlangt eine gültige Sitzung
 * im Header „Authorization: Sitzung <token>“. Die Website hält das Token im HttpOnly-Cookie.
 */
import type {
  AdminAnmeldung,
  AdminTerminFormular,
  MitteilungEingabe,
  OrtEingabe,
  Redaktion,
  Termin,
  Validierungsfehler,
} from '@kirmes/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface AdminAbhaengigkeiten {
  anmeldung: AdminAnmeldung;
  redaktion: Redaktion;
  terminDto: (t: Termin) => unknown;
}

const problem = (status: number, title: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});
const sitzungsToken = (h: string | undefined) =>
  h?.startsWith('Sitzung ') ? h.slice(8).trim() : '';
const ungueltig = (reply: FastifyReply, fehler: Validierungsfehler[]) =>
  reply
    .status(400)
    .type('application/problem+json')
    .send(problem(400, 'Ungültige Eingabe', { fehler }));
const nichtGefunden = (reply: FastifyReply) =>
  reply.status(404).type('application/problem+json').send(problem(404, 'Nicht gefunden'));

const ID = {
  type: 'object',
  properties: { id: { type: 'string', pattern: '^[0-9a-fA-F-]{1,36}$' } },
} as const;
const objekt = (pflicht: string[], eigenschaften: Record<string, unknown>) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: pflicht,
    properties: eigenschaften,
  }) as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max });
const OPT_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max });

const terminSchema = objekt(['ortSlug', 'datum', 'titel'], {
  ortSlug: TEXT(120),
  datum: TEXT(10),
  beginn: OPT_TEXT(5),
  titel: TEXT(200),
  veranstaltungsort: OPT_TEXT(120),
  kategorie: OPT_TEXT(20),
  bestaetigt: { type: 'boolean' },
});

declare module 'fastify' {
  interface FastifyRequest {
    adminId?: string;
  }
}

export async function adminRouten(app: FastifyInstance, d: AdminAbhaengigkeiten) {
  app.post<{ Body: { email: string; passwort: string; code: string } }>(
    '/api/v1/admin/anmelden',
    {
      schema: {
        body: objekt(['email', 'passwort', 'code'], {
          email: TEXT(200),
          passwort: TEXT(200),
          code: TEXT(10),
        }),
      },
    },
    async (req, reply) => {
      const r = await d.anmeldung.anmelden(req.body.email, req.body.passwort, req.body.code);
      reply.header('Cache-Control', 'no-store');
      if (r.ok) return r.value;
      req.log.warn({ grund: r.error }, 'Admin-Anmeldung fehlgeschlagen');
      return r.error === 'GESPERRT'
        ? reply
            .status(429)
            .header('Retry-After', '900')
            .send(problem(429, 'Zu viele Fehlversuche – bitte 15 Minuten warten.'))
        : reply.status(401).send(problem(401, 'E-Mail, Passwort oder Code falsch.'));
    },
  );

  // Alle weiteren Admin-Endpunkte: Sitzung prüfen
  const geschuetzt = async (req: FastifyRequest, reply: FastifyReply) => {
    const s = await d.anmeldung.pruefe(sitzungsToken(req.headers.authorization));
    if (!s) return reply.status(401).send(problem(401, 'Bitte anmelden.'));
    req.adminId = s.adminId;
    reply.header('Cache-Control', 'no-store');
  };
  const admin = (req: FastifyRequest) => req.adminId ?? '';

  await app.register(async (r) => {
    // onRequest: Anmeldung prüfen, BEVOR Eingaben validiert werden (keine Rückschlüsse für Nicht-Angemeldete)
    r.addHook('onRequest', geschuetzt);

    r.get('/api/v1/admin/ich', async (req) => ({ adminId: admin(req) }));
    r.post('/api/v1/admin/abmelden', async (req, reply) => {
      await d.anmeldung.abmelden(sitzungsToken(req.headers.authorization));
      return reply.status(204).send();
    });

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

    // Orte
    r.post<{ Body: OrtEingabe }>(
      '/api/v1/admin/orte',
      {
        schema: {
          body: objekt(['name', 'landkreis'], {
            name: TEXT(200),
            landkreis: TEXT(4),
            lat: { type: ['number', 'null'] },
            lon: { type: ['number', 'null'] },
          }),
        },
      },
      async (req, reply) => {
        const o = await d.redaktion.legeOrt(req.body, admin(req));
        return o.ok ? reply.status(201).send(o.value) : ungueltig(reply, o.error);
      },
    );

    // Termine (jeder Ort)
    r.post<{ Body: AdminTerminFormular }>(
      '/api/v1/admin/termine',
      { schema: { body: terminSchema } },
      async (req, reply) => {
        const t = await d.redaktion.legeTermin(req.body, admin(req));
        return t.ok
          ? reply
              .status(201)
              .send({ termin: d.terminDto(t.value.termin), hinweise: t.value.hinweise })
          : ungueltig(reply, t.error);
      },
    );
    r.put<{ Params: { id: string }; Body: AdminTerminFormular }>(
      '/api/v1/admin/termine/:id',
      { schema: { params: ID, body: terminSchema } },
      async (req, reply) => {
        const t = await d.redaktion.aendereTermin(req.params.id, req.body, admin(req));
        if (t.ok) return t.value;
        return t.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, t.error);
      },
    );
    r.post<{ Params: { id: string }; Body: { ortSlug: string } }>(
      '/api/v1/admin/termine/:id/bestaetigen',
      { schema: { params: ID, body: objekt(['ortSlug'], { ortSlug: TEXT(120) }) } },
      async (req, reply) =>
        (await d.redaktion.bestaetigeTermin(req.params.id, req.body.ortSlug, admin(req)))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );
    r.delete<{ Params: { id: string }; Querystring: { ort: string } }>(
      '/api/v1/admin/termine/:id',
      { schema: { params: ID, querystring: objekt(['ort'], { ort: TEXT(120) }) } },
      async (req, reply) =>
        (await d.redaktion.loescheTermin(req.params.id, req.query.ort, admin(req)))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );

    // Bearbeitungslinks
    r.get('/api/v1/admin/links', () => d.redaktion.listeLinks());
    r.post<{ Body: { ortSlug: string; bezeichnung: string } }>(
      '/api/v1/admin/links',
      {
        schema: {
          body: objekt(['ortSlug', 'bezeichnung'], { ortSlug: TEXT(120), bezeichnung: TEXT(300) }),
        },
      },
      async (req, reply) => {
        const l = await d.redaktion.erstelleLink(req.body.ortSlug, req.body.bezeichnung);
        return l.ok ? reply.status(201).send(l.value) : ungueltig(reply, l.error);
      },
    );
    r.post<{ Params: { id: string } }>(
      '/api/v1/admin/links/:id/sperren',
      { schema: { params: ID } },
      async (req, reply) =>
        (await d.redaktion.sperreLink(req.params.id))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );
  });
}
