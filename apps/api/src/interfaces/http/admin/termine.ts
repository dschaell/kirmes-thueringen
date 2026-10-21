/** Termine – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import type { AdminTerminFormular } from '@kirmes/core';
import { darf, darfOrt } from '@kirmes/core';
import {
  problem,
  ungueltig,
  nichtGefunden,
  ID,
  objekt,
  TEXT,
  terminSchema,
  zeileSchema,
} from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export function termineRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { admin, akteur } = k;
  /*
   * „Bestätigt“ setzt nur die Kirmesgesellschaft (Issue #240): Ihre Einträge und Änderungen sind
   * bestätigt. Redaktion/Admin können es nicht setzen – neu angelegt ist „nicht bestätigt“, beim
   * Bearbeiten bleibt der bisherige Stand.
   */
  type MitStatus = { bestaetigt?: boolean };
  const vomVeranstalter = (req: Parameters<typeof akteur>[0]) =>
    darf(akteur(req), 'termine.bestaetigen');
  const bisher = async (id: string) => (await d.terminFinden?.(id))?.bestaetigt ?? false;
  const neu = <T extends MitStatus>(req: Parameters<typeof akteur>[0], t: T): T => ({
    ...t,
    bestaetigt: vomVeranstalter(req),
  });
  const geaendert = async <T extends MitStatus>(
    req: Parameters<typeof akteur>[0],
    id: string,
    t: T,
  ): Promise<T> => ({ ...t, bestaetigt: vomVeranstalter(req) || (await bisher(id)) });
  // Termine (jeder Ort)
  if (d.terminHerkunft) {
    const herkunft = d.terminHerkunft;
    r.post<{ Body: { ids: string[] } }>(
      '/api/v1/admin/termine/herkunft',
      {
        schema: {
          body: objekt(['ids'], {
            ids: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
          }),
        },
      },
      // Kirmesgesellschaft: nur Termine des eigenen Ortes (Issue #200)
      (req) =>
        herkunft(
          req.body.ids,
          // KG hat laut Datenbank immer einen Ort; „null“ als Text träfe keinen Ort
          akteur(req).rolle === 'kirmesgesellschaft' ? `${akteur(req).ortSlug}` : null,
        ),
    );
  }
  if (d.terminFinden) {
    const finden = d.terminFinden;
    r.get<{ Params: { id: string } }>(
      '/api/v1/admin/termine/:id',
      { schema: { params: ID } },
      async (req, reply) => {
        const t = await finden(req.params.id);
        // Kirmesgesellschaft: fremde Termine gibt es für sie nicht (Issue #180)
        return t && darfOrt(akteur(req), t.ort.slug)
          ? { ...(d.terminDto(t) as object), version: t.version }
          : nichtGefunden(reply);
      },
    );
  }
  r.post<{ Body: AdminTerminFormular }>(
    '/api/v1/admin/termine',
    { schema: { body: terminSchema } },
    async (req, reply) => {
      const t = await d.redaktion.legeTermin(neu(req, req.body), admin(req));
      return t.ok
        ? reply
            .status(201)
            .send({ termin: d.terminDto(t.value.termin), hinweise: t.value.hinweise })
        : ungueltig(reply, t.error);
    },
  );
  r.post<{ Body: { ortSlug: string; zeilen: Omit<AdminTerminFormular, 'ortSlug'>[] } }>(
    '/api/v1/admin/termine/wochenende',
    {
      bodyLimit: 256 * 1024,
      schema: {
        body: objekt(['ortSlug', 'zeilen'], {
          ortSlug: TEXT(120),
          zeilen: { type: 'array', minItems: 1, maxItems: 20, items: zeileSchema },
        }),
      },
    },
    async (req, reply) => {
      const t = await d.redaktion.legeWochenende(
        req.body.ortSlug,
        req.body.zeilen.map((z) => neu(req, z)),
        admin(req),
      );
      return t.ok
        ? reply
            .status(201)
            .send({ termine: t.value.termine.map(d.terminDto), hinweise: t.value.hinweise })
        : ungueltig(reply, t.error);
    },
  );
  // Ganze Kirmes eines Ortes auf einmal bearbeiten (Issue #65) – alles oder nichts
  const sammelZeile = {
    ...zeileSchema,
    required: ['id', 'datum', 'titel'],
    properties: {
      ...zeileSchema.properties,
      id: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
      loeschen: { type: 'boolean' },
    },
  };
  r.post<{
    Body: {
      ortSlug: string;
      zeilen: (Omit<AdminTerminFormular, 'ortSlug'> & { id: string; loeschen?: boolean })[];
    };
  }>(
    '/api/v1/admin/termine/sammel',
    {
      schema: {
        body: objekt(['ortSlug', 'zeilen'], {
          ortSlug: TEXT(120),
          zeilen: { type: 'array', minItems: 1, maxItems: 80, items: sammelZeile },
        }),
      },
    },
    async (req, reply) => {
      const zeilen = await Promise.all(req.body.zeilen.map((z) => geaendert(req, z.id, z)));
      const t = await d.redaktion.bearbeiteKirmes(req.body.ortSlug, zeilen, admin(req));
      if (t.ok) return t.value;
      return t.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, t.error);
    },
  );
  // Mittagstisch eines Termins (Issue #66) – ersetzt die bisherigen Gerichte
  r.put<{
    Params: { id: string };
    Body: { version?: string; ortSlug: string; speisen: { name: string; preis: string }[] };
  }>(
    '/api/v1/admin/termine/:id/speisen',
    {
      schema: {
        params: ID,
        body: objekt(['ortSlug', 'speisen'], {
          version: TEXT(80),
          ortSlug: TEXT(120),
          speisen: {
            type: 'array',
            maxItems: 30,
            items: objekt(['name', 'preis'], { name: TEXT(200), preis: TEXT(20) }),
          },
        }),
      },
    },
    async (req, reply) => {
      const s = await d.redaktion.setzeSpeisen(
        req.params.id,
        req.body.ortSlug,
        req.body.speisen,
        admin(req),
        req.body.version,
      );
      if (s.ok) return { speisen: s.value };
      return s.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, s.error);
    },
  );
  r.put<{ Params: { id: string }; Body: AdminTerminFormular }>(
    '/api/v1/admin/termine/:id',
    { schema: { params: ID, body: terminSchema } },
    async (req, reply) => {
      const t = await d.redaktion.aendereTermin(
        req.params.id,
        await geaendert(req, req.params.id, req.body),
        admin(req),
      );
      if (t.ok) return t.value;
      return t.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, t.error);
    },
  );
  r.post<{ Params: { id: string }; Body: { ortSlug: string; version?: string } }>(
    '/api/v1/admin/termine/:id/bestaetigen',
    {
      schema: {
        params: ID,
        body: objekt(['ortSlug'], { ortSlug: TEXT(120), version: TEXT(80) }),
      },
    },
    async (req, reply) =>
      !vomVeranstalter(req)
        ? reply.status(403).send(problem(403, 'Bestätigen kann nur die Kirmesgesellschaft.'))
        : (await d.redaktion.bestaetigeTermin(
              req.params.id,
              req.body.ortSlug,
              admin(req),
              req.body.version,
            ))
          ? reply.status(204).send()
          : nichtGefunden(reply),
  );
  r.delete<{ Params: { id: string }; Querystring: { ort: string; version?: string } }>(
    '/api/v1/admin/termine/:id',
    {
      schema: { params: ID, querystring: objekt(['ort'], { ort: TEXT(120), version: TEXT(80) }) },
    },
    async (req, reply) =>
      (await d.redaktion.loescheTermin(req.params.id, req.query.ort, admin(req), req.query.version))
        ? reply.status(204).send()
        : nichtGefunden(reply),
  );
}
