/** Orte und Bearbeitungslinks – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import type { OrtEingabe, RedaktionsFilter } from '@kirmes/core';
import { darf } from '@kirmes/core';
import { problem, sitzungsToken, ungueltig, nichtGefunden, ID, objekt, TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function orteRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { admin, akteur } = k;
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
  // Versehentlich angelegte Orte entfernen – nur Admins, nur ohne Termine (Issue #159)
  r.get('/api/v1/admin/orte/eigene', async () => d.redaktion.eigeneOrte());
  r.delete<{ Params: { slug: string } }>(
    '/api/v1/admin/orte/:slug',
    { schema: { params: objekt(['slug'], { slug: TEXT(120) }) } },
    async (req, reply) => {
      if (!darf(akteur(req), 'orte.loeschen'))
        return reply.status(403).send(problem(403, 'Nur für Admins.'));
      const e = await d.redaktion.loescheOrt(req.params.slug, admin(req));
      if (e === 'geloescht') return reply.status(204).send();
      if (e === 'unbekannt') return nichtGefunden(reply);
      return reply
        .status(409)
        .send(
          problem(
            409,
            e === 'ortsverzeichnis'
              ? 'Orte aus dem Ortsverzeichnis können nicht gelöscht werden.'
              : 'Am Ort hängen noch Termine oder Vorschläge – bitte zuerst diese löschen oder verschieben.',
          ),
        );
    },
  );

  if (d.terminListe) {
    const liste = d.terminListe;
    r.get<{ Querystring: RedaktionsFilter }>(
      '/api/v1/admin/termine',
      {
        schema: {
          querystring: objekt([], {
            q: TEXT(100),
            ort: TEXT(120),
            datum: TEXT(10),
            von: TEXT(10),
            zeitraum: { type: 'string', enum: ['kommend', 'vergangen', 'alle'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          }),
        },
      },
      async (req, reply) => {
        const ergebnis = await liste.liste(sitzungsToken(req.headers.authorization), req.query);
        if (ergebnis.ok)
          return {
            gesamt: ergebnis.value.gesamt,
            termine: ergebnis.value.eintraege.map((t) => ({
              ...(d.terminDto(t) as object),
              version: t.version,
            })),
          };
        return ergebnis.error === 'VERBOTEN'
          ? reply.status(403).send(problem(403, 'Bitte anmelden.'))
          : ungueltig(reply, ergebnis.error);
      },
    );
  }

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
}
