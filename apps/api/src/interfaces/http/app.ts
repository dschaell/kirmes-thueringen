import { vorschlagRouten } from './vorschlag-routen.js';
import { korrekturRouten } from './korrektur-routen.js';
import type { Korrekturen, Vorschlaege } from '@kirmes/core';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { isIP } from 'node:net';
import {
  LANDKREISE,
  TerminKonflikt,
  LetzterAdmin,
  PersistenzNichtVerfuegbar,
  type FindeOrt,
  type FindeTermin,
  type ListeOrte,
  type SucheTermine,
  type VerwalteFestplaetze,
  type VerwalteTermine,
  type Mitteilung,
  type TerminFormular,
  type Termin,
  type Validierungsfehler,
  type MeldeAnRedaktion,
  type MeldungEingabe,
} from '@kirmes/core';
import { adminRouten, type AdminAbhaengigkeiten } from './admin-routen.js';
import Fastify, { type FastifyError, type FastifyReply, type FastifyServerOptions } from 'fastify';

export interface AppAbhaengigkeiten {
  sucheTermine: SucheTermine;
  listeOrte: ListeOrte;
  findeOrt: FindeOrt;
  findeTermin: FindeTermin;
  verwalteFestplaetze: VerwalteFestplaetze;
  verwalteTermine: VerwalteTermine;
  /** Neueste veröffentlichte Mitteilung (öffentlich) */
  aktuelleMitteilung: () => Promise<Mitteilung | null>;
  /** Redaktionszugang; ohne diese Abhängigkeit gibt es keine Admin-Endpunkte */
  admin?: Omit<AdminAbhaengigkeiten, 'terminDto'>;
  /** Meldungen an die Redaktion per E-Mail; fehlt sie, antwortet der Endpunkt mit 503 */
  meldungen?: MeldeAnRedaktion;
  terminVorschlaege?: Vorschlaege;
  korrekturen?: Korrekturen;
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
  festplatz: t.festplatz,
  band: t.band,
  pfarrer: t.pfarrer,
  muttizettel: t.muttizettel,
  info: t.info,
  // Letzte Änderung – Kalender-Abos erkennen damit Änderungen (Issue #139)
  geaendertAm: t.geaendertAm,
  // Mittagstisch nur in der Einzelansicht
  ...(t.speisen && { speisen: t.speisen }),
});

/** „Authorization: Bearer <token>“ → token */
const bearer = (h: string | undefined): string =>
  h?.startsWith('Bearer ') ? h.slice(7).trim() : '';

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

  if (d.admin) await adminRouten(app, { ...d.admin, terminDto });

  return app;
}
