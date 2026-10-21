/**
 * Redaktions-API (/api/v1/admin/*). Anmeldung nur mit Passkey. Jeder Endpunkt außer Anmeldung,
 * Ersteinrichtung und Einladung verlangt eine gültige Sitzung
 * im Header „Authorization: Sitzung <token>“. Die Website hält das Token im HttpOnly-Cookie.
 */
import { darfOrt, nurEigenerOrt } from '@kirmes/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { problem, sitzungsToken, type AdminAbhaengigkeiten } from './admin/gemeinsam.js';
import { kontext } from './admin/kontext.js';
import { zugangRouten } from './admin/zugang.js';
import { kontoRouten } from './admin/konto.js';
import { plaetzeRouten } from './admin/plaetze.js';
import { mitgliederRouten } from './admin/mitglieder.js';
import { mitteilungenRouten } from './admin/mitteilungen.js';
import { orteRouten } from './admin/orte.js';
import { termineRouten } from './admin/termine.js';

export type { AdminAbhaengigkeiten };

export async function adminRouten(app: FastifyInstance, d: AdminAbhaengigkeiten) {
  const k = kontext();
  const { keinCache, akteur } = k;
  zugangRouten(app, d, k);

  // ── Alle weiteren Endpunkte: Sitzung prüfen ───────────────────────────────────────────
  const geschuetzt = async (req: FastifyRequest, reply: FastifyReply) => {
    const s = await d.anmeldung.pruefe(sitzungsToken(req.headers.authorization));
    if (!s) return reply.status(401).send(problem(401, 'Bitte anmelden.'));
    req.sitzung = s;
    keinCache(reply);
  };
  /** Routen, die eine Kirmesgesellschaft nutzen darf (Methode + Muster), Issue #180 */
  const KG_ROUTEN = new Set([
    'GET /api/v1/admin/ich',
    'POST /api/v1/admin/abmelden',
    'GET /api/v1/admin/passkeys',
    'POST /api/v1/admin/passkeys/optionen',
    'POST /api/v1/admin/passkeys',
    'DELETE /api/v1/admin/passkeys/:id',
    'GET /api/v1/admin/vorschlaege',
    'GET /api/v1/admin/termine',
    'POST /api/v1/admin/termine/herkunft',
    'GET /api/v1/admin/termine/:id',
    'POST /api/v1/admin/termine',
    'POST /api/v1/admin/termine/wochenende',
    'POST /api/v1/admin/termine/sammel',
    'PUT /api/v1/admin/termine/:id',
    'PUT /api/v1/admin/termine/:id/speisen',
    'POST /api/v1/admin/termine/:id/bestaetigen',
    'DELETE /api/v1/admin/termine/:id',
    'GET /api/v1/admin/orte/:slug/festplaetze',
    'POST /api/v1/admin/orte/:slug/festplaetze',
    'DELETE /api/v1/admin/orte/:slug/festplaetze',
    'POST /api/v1/admin/orte/:slug/festplaetze/umbenennen',
    // Eigene Leute einladen (Issue #231) – Ort und Rolle legt der Use Case fest
    'GET /api/v1/admin/mitglieder',
    'GET /api/v1/admin/einladungen',
    'POST /api/v1/admin/einladungen',
    'DELETE /api/v1/admin/einladungen/:id',
    // Eigene Leute entfernen (Issue #233) – nur gleicher Ort, nicht sich selbst (Use Case)
    'DELETE /api/v1/admin/mitglieder/:id',
    // Eigenen Namen ändern (Issue #244) – fremde Namen nur Admin (Use Case)
    'PUT /api/v1/admin/mitglieder/:id/name',
  ]);

  await app.register(async (r) => {
    // onRequest: Anmeldung prüfen, BEVOR Eingaben validiert werden (keine Rückschlüsse für Nicht-Angemeldete)
    r.addHook('onRequest', geschuetzt);
    // Kirmesgesellschaft (Issue #180): standardmäßig verboten – nur freigegebene Routen, und dort
    // nur der eigene Ort (aus Body, Query oder Pfad). Vergessene Routen bleiben so zu.
    r.addHook('preHandler', async (req, reply) => {
      const s = akteur(req);
      if (!nurEigenerOrt(s)) return;
      if (!KG_ROUTEN.has(`${req.method} ${req.routeOptions.url}`))
        return reply.status(403).send(problem(403, 'Für Kirmesgesellschaften nicht freigegeben.'));
      const ort =
        (req.body as { ortSlug?: string } | undefined)?.ortSlug ??
        (req.query as { ort?: string } | undefined)?.ort ??
        (req.params as { slug?: string } | undefined)?.slug;
      if (ort !== undefined && !darfOrt(s, ort))
        return reply.status(403).send(problem(403, 'Nur Termine und Plätze eures Ortes.'));
    });

    kontoRouten(r, d, k);
    plaetzeRouten(r, d, k);
    mitgliederRouten(r, d, k);
    mitteilungenRouten(r, d, k);
    orteRouten(r, d, k);
    termineRouten(r, d, k);
  });
}
