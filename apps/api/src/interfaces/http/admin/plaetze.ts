/** Plätze eines Ortes – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import { ungueltig, nichtGefunden, objekt, TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function plaetzeRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { admin } = k;
  // Plätze eines Ortes (Redaktion)
  const fp = d.festplaetze;
  if (fp) {
    const SLUG = {
      type: 'object',
      properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{1,120}$' } },
    } as const;
    r.get<{ Params: { slug: string } }>(
      '/api/v1/admin/orte/:slug/festplaetze',
      { schema: { params: SLUG } },
      async (req, reply) => (await fp.uebersicht(req.params.slug)) ?? nichtGefunden(reply),
    );
    r.post<{
      Params: { slug: string };
      Body: { name: string; standort: string; nameNoetig?: boolean };
    }>(
      '/api/v1/admin/orte/:slug/festplaetze',
      {
        schema: {
          params: SLUG,
          body: objekt(['name', 'standort'], {
            name: TEXT(120),
            standort: TEXT(2000),
            nameNoetig: { type: 'boolean' },
          }),
        },
      },
      async (req, reply) => {
        const s = await fp.speichere(req.params.slug, req.body, admin(req));
        if (!s.ok) return ungueltig(reply, s.error);
        req.log.info({ akteur: admin(req), ort: req.params.slug }, 'Platz gespeichert');
        return reply.status(201).send(s.value);
      },
    );
    r.delete<{ Params: { slug: string }; Querystring: { name?: string } }>(
      '/api/v1/admin/orte/:slug/festplaetze',
      {
        schema: {
          params: SLUG,
          querystring: { type: 'object', properties: { name: TEXT(120) } },
        },
      },
      async (req, reply) =>
        (await fp.loesche(req.params.slug, req.query.name ?? '', admin(req)))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );
    // Platz umbenennen: Termine und Kartenpunkt ziehen gemeinsam um (Issue #216)
    r.post<{ Params: { slug: string }; Body: { alt: string; neu: string } }>(
      '/api/v1/admin/orte/:slug/festplaetze/umbenennen',
      {
        schema: { params: SLUG, body: objekt(['alt', 'neu'], { alt: TEXT(120), neu: TEXT(120) }) },
      },
      async (req, reply) => {
        const e = await fp.benenneUm(req.params.slug, req.body.alt, req.body.neu, admin(req));
        if (!e.ok) return ungueltig(reply, e.error);
        req.log.info({ akteur: admin(req), ort: req.params.slug }, 'Platz umbenannt');
        return reply.status(204).send();
      },
    );
    // Ortsmitte (Ziel der Route ohne eigenen Platz) – Recht 'orte.bearbeiten' (Issue #216);
    // Kirmesgesellschaften sperrt schon der Filter (nicht in KG_ROUTEN)
    r.put<{ Params: { slug: string }; Body: { standort: string } }>(
      '/api/v1/admin/orte/:slug/mitte',
      { schema: { params: SLUG, body: objekt(['standort'], { standort: TEXT(2000) }) } },
      async (req, reply) => {
        const e = await fp.setzeOrtsmitte(req.params.slug, req.body.standort, admin(req));
        if (!e.ok) return ungueltig(reply, e.error);
        req.log.info({ akteur: admin(req), ort: req.params.slug }, 'Ortsmitte gesetzt');
        return e.value;
      },
    );
  }

  r.get('/api/v1/admin/vorschlaege', () =>
    d.vorschlaege ? d.vorschlaege() : { bands: [], titel: [] },
  );
}
