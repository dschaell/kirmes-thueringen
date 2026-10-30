/** Vereinsprofil eines Ortes speichern (Issue #310) – Rechte prüft der Use Case. */
import type { OrtsprofilEingabe } from '@kirmes/core';
import type { FastifyInstance } from 'fastify';
import { nichtGefunden, objekt, TEXT, ungueltig, type AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

const FELD = { type: ['string', 'null'], maxLength: 2000 };

export function ortsprofilRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const p = d.ortsprofile;
  if (!p) return;
  const { admin, akteur } = k;
  r.put<{ Params: { slug: string }; Body: OrtsprofilEingabe }>(
    '/api/v1/admin/orte/:slug/profil',
    {
      schema: {
        params: objekt(['slug'], { slug: TEXT(120) }),
        body: objekt([], {
          text: FELD,
          website: FELD,
          instagram: FELD,
          facebook: FELD,
          kontakt: FELD,
        }),
      },
    },
    async (req, reply) => {
      const m = await p.setze(akteur(req), req.params.slug, req.body);
      if (m.ok) {
        req.log.info({ akteur: admin(req), ort: req.params.slug }, 'Vereinsprofil gespeichert');
        return m.value;
      }
      // Fremde Orte sperrt für Kirmesgesellschaften schon der Filter (403) – sonst wie unbekannt
      if (m.error === 'NICHT_GEFUNDEN' || m.error === 'NUR_ADMIN') return nichtGefunden(reply);
      return ungueltig(reply, m.error);
    },
  );
}
