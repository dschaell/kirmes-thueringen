import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  LANDKREISE,
  PersistenzNichtVerfuegbar,
  type SucheTermine,
  type Termin,
  type Validierungsfehler,
} from '@kirmes/core';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';

export interface AppAbhaengigkeiten {
  sucheTermine: SucheTermine;
  datenbankErreichbar: () => Promise<boolean>;
  erlaubteOrigins: readonly string[];
  logger?: FastifyServerOptions['logger'];
}

interface TermineQuery {
  von?: string;
  bis?: string;
  landkreis?: string | string[];
  kategorie?: string | string[];
  q?: string;
  bestaetigt?: boolean;
  limit?: number;
  offset?: number;
}

/** „GTH,IK“ und ?landkreis=GTH&landkreis=IK werden gleich behandelt. */
const liste = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(',')).filter(Boolean);

/** RFC 9457 Problem Details */
const problem = (status: number, title: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});

const termineQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    von: { type: 'string', maxLength: 10 },
    bis: { type: 'string', maxLength: 10 },
    landkreis: {
      anyOf: [
        { type: 'string', maxLength: 120 },
        { type: 'array', maxItems: 23, items: { type: 'string', maxLength: 4 } },
      ],
    },
    kategorie: {
      anyOf: [
        { type: 'string', maxLength: 120 },
        { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 20 } },
      ],
    },
    q: { type: 'string', maxLength: 100 },
    bestaetigt: { type: 'boolean' },
    limit: { type: 'integer' },
    offset: { type: 'integer' },
  },
} as const;

const terminDto = (t: Termin) => ({
  id: t.id,
  datum: t.datum,
  beginn: t.beginn,
  titel: t.titel,
  veranstaltungsort: t.veranstaltungsort,
  kategorie: t.kategorie,
  bestaetigt: t.bestaetigt,
  ort: t.ort,
});

export async function baueApp(d: AppAbhaengigkeiten) {
  const app = Fastify({
    logger: d.logger ?? false,
    bodyLimit: 16 * 1024,
    trustProxy: true,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // CORS: zurückgegeben wird nur ein Wert aus der Konfiguration, nie der Request-Header selbst.
  app.addHook('onSend', async (req, reply) => {
    const erlaubt = d.erlaubteOrigins.find((o) => o === req.headers.origin);
    if (erlaubt) reply.header('Access-Control-Allow-Origin', erlaubt).header('Vary', 'Origin');
  });

  app.setErrorHandler((fehler: FastifyError | PersistenzNichtVerfuegbar, req, reply) => {
    if (fehler instanceof PersistenzNichtVerfuegbar) {
      req.log.error({ err: fehler.cause }, 'Datenbank nicht erreichbar');
      return reply
        .status(503)
        .header('Retry-After', '30')
        .type('application/problem+json')
        .send(problem(503, 'Dienst vorübergehend nicht verfügbar'));
    }
    if ('validation' in fehler && fehler.validation) {
      return reply
        .status(400)
        .type('application/problem+json')
        .send(problem(400, 'Ungültige Anfrage', { detail: fehler.message }));
    }
    const status = fehler.statusCode && fehler.statusCode < 500 ? fehler.statusCode : 500;
    if (status >= 500) req.log.error({ err: fehler }, 'Unerwarteter Fehler');
    // Keine Stacktraces oder Interna nach außen (OWASP A05)
    return reply
      .status(status)
      .type('application/problem+json')
      .send(problem(status, status === 500 ? 'Interner Fehler' : fehler.message));
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) =>
    (await d.datenbankErreichbar())
      ? { status: 'ok' }
      : reply.status(503).send({ status: 'datenbank nicht erreichbar' }),
  );

  app.get('/api/v1/landkreise', async () =>
    Object.entries(LANDKREISE).map(([kuerzel, name]) => ({ kuerzel, name })),
  );

  app.get<{ Querystring: TermineQuery }>(
    '/api/v1/termine',
    { schema: { querystring: termineQuerySchema } },
    async (req, reply) => {
      const q = req.query;
      const r = await d.sucheTermine.ausfuehren({
        ...(q.von && { von: q.von }),
        ...(q.bis && { bis: q.bis }),
        landkreise: liste(q.landkreis),
        kategorien: liste(q.kategorie),
        ...(q.q && { q: q.q }),
        ...(q.bestaetigt !== undefined && { nurBestaetigt: q.bestaetigt }),
        ...(q.limit !== undefined && { limit: q.limit }),
        ...(q.offset !== undefined && { offset: q.offset }),
      });
      if (!r.ok) {
        return reply
          .status(400)
          .type('application/problem+json')
          .send(
            problem(400, 'Ungültige Filter', { fehler: r.error satisfies Validierungsfehler[] }),
          );
      }
      reply.header('Cache-Control', 'public, max-age=300');
      return { gesamt: r.value.gesamt, termine: r.value.eintraege.map(terminDto) };
    },
  );

  return app;
}
