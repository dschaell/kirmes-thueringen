import { pushRouten } from './push-routen.js';
import { vorschlagRouten } from './vorschlag-routen.js';
import { korrekturRouten } from './korrektur-routen.js';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { isIP } from 'node:net';
import {
  LANDKREISE,
  TerminKonflikt,
  LetzterAdmin,
  PersistenzNichtVerfuegbar,
  type Validierungsfehler,
  type MeldungEingabe,
} from '@kirmes/core';
import { adminRouten } from './admin-routen.js';
import { liste, problem, terminDto } from './antworten.js';
import { verwaltungRouten } from './verwaltung-routen.js';
import type { AppAbhaengigkeiten } from './abhaengigkeiten.js';
import Fastify, { type FastifyError } from 'fastify';

export type { AppAbhaengigkeiten };

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
    if (fehler instanceof TerminKonflikt || fehler instanceof LetzterAdmin) {
      return reply.status(409).type('application/problem+json').send(problem(409, fehler.message));
    }
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

  // Meldung an die Redaktion (Termin melden, Link anfordern) – Versand per SMTP
  const T = (max: number) => ({ type: 'string', maxLength: max });
  app.post<{ Body: MeldungEingabe }>(
    '/api/v1/meldungen',
    {
      bodyLimit: 16 * 1024,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['art', 'ort', 'absender', 'email'],
          properties: {
            art: { type: 'string', enum: ['termin', 'link', 'mitmachen'] },
            ort: T(200),
            landkreis: T(100),
            datum: T(20),
            zeit: T(10),
            titel: T(300),
            veranstaltungsort: T(200),
            info: T(4000),
            absender: T(200),
            email: T(300),
            falle: T(500),
            dauerMs: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!d.meldungen) {
        return reply
          .status(503)
          .type('application/problem+json')
          .send(problem(503, 'Meldungen per E-Mail sind gerade nicht möglich.'));
      }
      // Hinter der Website (internes Netz) zählt die IP der Besucher, die die Website mitschickt
      const weitergeleitet = req.headers['x-kirmes-client-ip'];
      const herkunft =
        istInternesNetz(req.socket.remoteAddress) && typeof weitergeleitet === 'string'
          ? weitergeleitet.slice(0, 64)
          : req.ip;
      try {
        const r = await d.meldungen.melde(req.body, herkunft);
        if (r.ok) return reply.status(202).send({ angenommen: true });
        if (r.error === 'ZU_VIELE') {
          return reply
            .status(429)
            .type('application/problem+json')
            .send(problem(429, 'Zu viele Meldungen – bitte später noch einmal versuchen.'));
        }
        return reply
          .status(400)
          .type('application/problem+json')
          .send(problem(400, 'Ungültige Eingabe', { fehler: r.error }));
      } catch (e) {
        req.log.error({ err: e }, 'Meldung konnte nicht versendet werden');
        return reply
          .status(502)
          .type('application/problem+json')
          .send(problem(502, 'Die Meldung konnte gerade nicht versendet werden.'));
      }
    },
  );

  app.get('/api/v1/eingabe-vorschlaege', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return d.admin?.vorschlaege ? d.admin.vorschlaege() : { bands: [], titel: [] };
  });

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

  app.get<{ Params: { id: string } }>(
    '/api/v1/termine/:id',
    {
      schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 36 } } } },
    },
    async (req, reply) => {
      const t = await d.findeTermin.ausfuehren(req.params.id);
      if (!t) {
        return reply
          .status(404)
          .type('application/problem+json')
          .send(problem(404, 'Termin nicht gefunden'));
      }
      reply.header('Cache-Control', 'public, max-age=300');
      return terminDto(t);
    },
  );

  // Plakat eines Termins (Issue #297): neu kodiertes WebP; die Adresse enthält den Stand, daher lange cachebar
  if (d.plakate) {
    const plakate = d.plakate;
    app.get<{ Params: { id: string; groesse: 'gross' | 'klein' } }>(
      '/api/v1/termine/:id/plakat/:groesse',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id', 'groesse'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              groesse: { type: 'string', enum: ['gross', 'klein'] },
            },
          },
        },
      },
      async (req, reply) => {
        const bild = await plakate.zeige(req.params.id, req.params.groesse);
        if (!bild)
          return reply
            .status(404)
            .type('application/problem+json')
            .send(problem(404, 'Kein Plakat'));
        return reply
          .type('image/webp')
          .header('Cache-Control', 'public, max-age=86400')
          .send(Buffer.from(bild));
      },
    );
  }

  app.get<{ Querystring: { bbox?: string } }>(
    '/api/v1/orte',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { bbox: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (req, reply) => {
      let orte;
      if (req.query.bbox !== undefined) {
        const r = await d.listeOrte.imAusschnitt(req.query.bbox);
        if (!r.ok) {
          return reply
            .status(400)
            .type('application/problem+json')
            .send(problem(400, 'Ungültiger Kartenausschnitt', { fehler: r.error }));
        }
        orte = r.value;
      } else orte = await d.listeOrte.ausfuehren();
      reply.header('Cache-Control', 'public, max-age=300');
      return orte.map((o) => ({ ...o.ort, anzahlKommend: o.anzahlKommend }));
    },
  );

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

  verwaltungRouten(app, d);

  // Zugriffszahlen (Issue #311): Summen der Website, nur aus dem internen Netz (Docker/localhost)
  if (d.zugriffe) {
    const zugriffe = d.zugriffe;
    app.post<{ Body: { aufrufe: { pfad: string; anzahl: number }[] } }>(
      '/api/v1/intern/aufrufe',
      {
        bodyLimit: 256 * 1024,
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['aufrufe'],
            properties: {
              aufrufe: {
                type: 'array',
                maxItems: 2000,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['pfad', 'anzahl'],
                  properties: {
                    pfad: { type: 'string', maxLength: 200 },
                    anzahl: { type: 'integer', minimum: 1, maximum: 1000000 },
                  },
                },
              },
            },
          },
        },
      },
      async (req, reply) => {
        if (!istInternesNetz(req.socket.remoteAddress))
          return reply.status(404).send(problem(404, 'Nicht gefunden'));
        return { erfasst: await zugriffe.erfasse(req.body.aufrufe) };
      },
    );
  }

  // ── Mitteilungen (öffentlich) ──────────────────────────────────────────────────────────
  app.get('/api/v1/mitteilungen/aktuell', async (_req, reply) => {
    const m = await d.aktuelleMitteilung();
    reply.header('Cache-Control', 'public, max-age=60');
    if (!m) return reply.status(404).send(problem(404, 'Keine Mitteilung'));
    return { id: m.id, titel: m.titel, text: m.text, link: m.link, datum: m.veroeffentlichtAm };
  });

  const herkunft = (ip: string | undefined, weiter: unknown, fallback: string) =>
    istInternesNetz(ip) && typeof weiter === 'string' ? weiter.slice(0, 64) : fallback;
  if (d.terminVorschlaege) await vorschlagRouten(app, d.terminVorschlaege, herkunft);
  if (d.korrekturen) await korrekturRouten(app, d.korrekturen, herkunft);
  if (d.push) await pushRouten(app, d.push);

  if (d.admin) await adminRouten(app, { ...d.admin, terminDto });

  return app;
}
