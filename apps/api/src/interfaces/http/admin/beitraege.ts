/**
 * Beiträge mit Fotos (Issue #352): Entwurf anlegen, Fotos einzeln als Rohbild hochladen,
 * veröffentlichen oder löschen. Rechte und Ort prüft der Use Case.
 */
import { BEITRAG_MAX_TEXT, FOTO_ALT_MAX, PLAKAT_MAX_BYTES, type BeitragFehler } from '@kirmes/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ID, objekt, problem, TEXT, type AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';
import { BILDTYPEN } from './plakate.js';

const FEHLER: Record<BeitragFehler, [number, string]> = {
  NICHT_GEFUNDEN: [404, 'Nicht gefunden'],
  NUR_ADMIN: [403, 'Keine Berechtigung.'],
  EINWILLIGUNG: [400, 'Bitte bestätigen, dass ihr die Fotos zeigen dürft.'],
  TEXT: [400, `Text: höchstens ${BEITRAG_MAX_TEXT} Zeichen.`],
  TERMIN: [400, 'Der Termin gehört nicht zu diesem Ort.'],
  LEER: [400, 'Bitte einen Text schreiben oder ein Foto hinzufügen.'],
  ALT: [400, `Bildbeschreibung: höchstens ${FOTO_ALT_MAX} Zeichen.`],
  ZU_GROSS: [413, 'Foto zu groß – höchstens 8 MB.'],
  KEIN_BILD: [400, 'Kein lesbares Bild – bitte ein Foto als JPEG, PNG oder WebP.'],
  ZU_VIELE_FOTOS: [400, 'Höchstens 6 Fotos je Beitrag.'],
  SPEICHER: [507, 'Für diesen Ort sind schon sehr viele Fotos gespeichert – bitte alte löschen.'],
  VEROEFFENTLICHT: [409, 'Der Beitrag ist schon veröffentlicht.'],
};

export function beitraegeRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const b = d.beitraege;
  if (!b) return;
  const { admin, akteur } = k;
  // Rohbilder wie beim Plakat – der Parser ist dort schon angemeldet, falls es Plakate gibt
  if (!r.hasContentTypeParser('image/jpeg'))
    r.addContentTypeParser(
      BILDTYPEN,
      { parseAs: 'buffer', bodyLimit: PLAKAT_MAX_BYTES },
      (_req, body, fertig) => fertig(null, body),
    );
  const fehler = (reply: FastifyReply, e: BeitragFehler) => {
    const [status, text] = FEHLER[e];
    return reply.status(status).type('application/problem+json').send(problem(status, text));
  };
  r.post<{
    Body: { ortSlug: string; text: string; terminId?: string | null; einverstanden: boolean };
  }>(
    '/api/v1/admin/beitraege',
    {
      schema: {
        body: objekt(['ortSlug', 'text', 'einverstanden'], {
          ortSlug: TEXT(120),
          text: TEXT(BEITRAG_MAX_TEXT * 2),
          terminId: { type: ['string', 'null'], maxLength: 36 },
          einverstanden: { type: 'boolean' },
        }),
      },
    },
    async (req, reply) => {
      const e = await b.schreibe(akteur(req), req.body);
      if (!e.ok) return fehler(reply, e.error);
      return reply.status(201).send(e.value);
    },
  );
  // Foto als Rohbild (wie beim Plakat), Beschreibung in der Abfrage
  r.post<{ Params: { id: string }; Querystring: { alt?: string }; Body: Buffer }>(
    '/api/v1/admin/beitraege/:id/fotos',
    {
      bodyLimit: PLAKAT_MAX_BYTES,
      schema: {
        params: ID,
        querystring: { type: 'object', properties: { alt: TEXT(FOTO_ALT_MAX * 2) } },
      },
    },
    async (req, reply) => {
      if (!Buffer.isBuffer(req.body))
        return reply
          .status(415)
          .send(problem(415, 'Bitte ein Bild als JPEG, PNG oder WebP schicken.'));
      const e = await b.fuegeFotoHinzu(
        akteur(req),
        req.params.id,
        new Uint8Array(req.body),
        req.query.alt ?? '',
      );
      if (!e.ok) return fehler(reply, e.error);
      return reply.status(201).send(e.value);
    },
  );
  r.post<{ Params: { id: string } }>(
    '/api/v1/admin/beitraege/:id/veroeffentlichen',
    { schema: { params: ID } },
    async (req, reply) => {
      const e = await b.veroeffentliche(akteur(req), req.params.id);
      if (!e.ok) return fehler(reply, e.error);
      req.log.info({ akteur: admin(req), beitrag: req.params.id }, 'Beitrag veröffentlicht');
      return e.value;
    },
  );
  r.delete<{ Params: { id: string } }>(
    '/api/v1/admin/beitraege/:id',
    { schema: { params: ID } },
    async (req, reply) => {
      const e = await b.entferne(akteur(req), req.params.id);
      if (!e.ok) return fehler(reply, e.error);
      req.log.info({ akteur: admin(req), beitrag: req.params.id }, 'Beitrag gelöscht');
      return reply.status(204).send();
    },
  );
}
