/** Plakat je Termin hochladen oder entfernen (Issue #297) – Rechte prüft der Use Case. */
import { PLAKAT_MAX_BYTES, type PlakatFehler } from '@kirmes/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ID, problem, type AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export const BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp'];
const FEHLER: Record<PlakatFehler, [number, string]> = {
  NICHT_GEFUNDEN: [404, 'Nicht gefunden'],
  NUR_ADMIN: [403, 'Keine Berechtigung.'],
  ZU_GROSS: [413, 'Bild zu groß – höchstens 8 MB.'],
  KEIN_BILD: [400, 'Kein lesbares Bild – bitte ein Foto als JPEG, PNG oder WebP.'],
};

export function plakateRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const p = d.plakate;
  if (!p) return;
  const { admin, akteur } = k;
  // Rohes Bild als Body – nur diese Typen, Größe begrenzt
  r.addContentTypeParser(
    BILDTYPEN,
    { parseAs: 'buffer', bodyLimit: PLAKAT_MAX_BYTES },
    (_req, body, fertig) => fertig(null, body),
  );
  const fehler = (reply: FastifyReply, e: PlakatFehler) => {
    const [status, text] = FEHLER[e];
    return reply.status(status).type('application/problem+json').send(problem(status, text));
  };
  r.put<{ Params: { id: string }; Body: Buffer }>(
    '/api/v1/admin/termine/:id/plakat',
    { bodyLimit: PLAKAT_MAX_BYTES, schema: { params: ID } },
    async (req, reply) => {
      if (!Buffer.isBuffer(req.body))
        return reply
          .status(415)
          .send(problem(415, 'Bitte ein Bild als JPEG, PNG oder WebP schicken.'));
      const m = await p.lade(akteur(req), req.params.id, new Uint8Array(req.body));
      if (!m.ok) return fehler(reply, m.error);
      req.log.info({ akteur: admin(req), termin: req.params.id }, 'Plakat gespeichert');
      return m.value;
    },
  );
  r.delete<{ Params: { id: string } }>(
    '/api/v1/admin/termine/:id/plakat',
    { schema: { params: ID } },
    async (req, reply) => {
      const m = await p.entferne(akteur(req), req.params.id);
      if (!m.ok) return fehler(reply, m.error);
      req.log.info({ akteur: admin(req), termin: req.params.id }, 'Plakat entfernt');
      return reply.status(204).send();
    },
  );
}
