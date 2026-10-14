import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { isIP } from 'node:net';
import {
  LANDKREISE,
  PersistenzNichtVerfuegbar,
  type FindeOrt,
  type ListeOrte,
  type SucheTermine,
  type Termin,
  type Validierungsfehler,
} from '@kirmes/core';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';

export interface AppAbhaengigkeiten {
  sucheTermine: SucheTermine;
  listeOrte: ListeOrte;
  findeOrt: FindeOrt;
  datenbankErreichbar: () => Promise<boolean>;
  logger?: FastifyServerOptions['logger'];
}

interface TermineQuery {
  von?: string;
  bis?: string;
  landkreis?: string | string[];
  kategorie?: string | string[];
  q?: string;
  ort?: string;
  bestaetigt?: boolean;
  limit?: number;
  offset?: number;
}

/** „GTH,IK“ und ?landkreis=GTH&landkreis=IK werden gleich behandelt. */
const liste = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(',')).filter(Boolean);

/**
 * Aufrufer aus privaten Netzen (Website-Container, localhost) sind vom Rate-Limit ausgenommen:
 * Die API ist nicht öffentlich erreichbar, alle Seitenaufrufe kommen über den Web-Server.
 */
export function istInternesNetz(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === '::1' || /^f[cd]/i.test(ip);
}

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
    ort: { type: 'string', maxLength: 120 },
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
    // Kein trustProxy: Die API steht nicht hinter einem öffentlichen Proxy, X-Forwarded-For wäre fälschbar.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => istInternesNetz(req.socket.remoteAddress),
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
        ...(q.ort && { ort: q.ort }),
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

  app.get('/api/v1/orte', async (_req, reply) => {
    const orte = await d.listeOrte.ausfuehren();
    reply.header('Cache-Control', 'public, max-age=300');
    return orte.map((o) => ({ ...o.ort, anzahlKommend: o.anzahlKommend }));
  });

  app.get<{ Params: { slug: string } }>(
    '/api/v1/orte/:slug',
    {
      schema: {
        params: { type: 'object', properties: { slug: { type: 'string', maxLength: 120 } } },
      },
    },
    async (req, reply) => {
      const ort = await d.findeOrt.ausfuehren(req.params.slug);
      if (!ort) {
        return reply
          .status(404)
          .type('application/problem+json')
          .send(problem(404, 'Ort nicht gefunden'));
      }
      reply.header('Cache-Control', 'public, max-age=300');
      return ort;
    },
  );

  return app;
}
