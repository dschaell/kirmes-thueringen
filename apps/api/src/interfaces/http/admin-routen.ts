/**
 * Redaktions-API (/api/v1/admin/*). Anmeldung nur mit Passkey. Jeder Endpunkt außer Anmeldung,
 * Ersteinrichtung und Einladung verlangt eine gültige Sitzung
 * im Header „Authorization: Sitzung <token>“. Die Website hält das Token im HttpOnly-Cookie.
 */
import type {
  AdminAnmeldung,
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  AdminTerminFormular,
  MitteilungEingabe,
  OrtEingabe,
  Passkeys,
  Redaktion,
  RedaktionsFestplaetze,
  Rolle,
  Sitzung,
  Termin,
  Validierungsfehler,
} from '@kirmes/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface AdminAbhaengigkeiten {
  anmeldung: AdminAnmeldung;
  redaktion: Redaktion;
  terminDto: (t: Termin) => unknown;
  /** Passkeys sind optional (fehlt WEBSITE_URL, bleibt es bei Passwort + Einmalcode) */
  passkeys?: Passkeys;
  /** Erster Admin im Browser – braucht E-Mail-Versand und WEBSITE_URL */
  einrichtung?: Ersteinrichtung;
  /** Einladung annehmen – braucht WEBSITE_URL (Passkeys) */
  beitritt?: Beitritt;
  mitglieder: Mitgliederverwaltung;
  /** Plätze eines Ortes (Kirche, Festzelt …) mit Standort – Issue #62 */
  festplaetze?: RedaktionsFestplaetze;
  /** Eingabe-Vorschläge (Bands, Titel) aus allen Terminen */
  vorschlaege?: () => Promise<{ bands: string[]; titel: string[] }>;
}

const problem = (status: number, title: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});
const sitzungsToken = (h: string | undefined) =>
  h?.startsWith('Sitzung ') ? h.slice(8).trim() : '';
const ungueltig = (reply: FastifyReply, fehler: Validierungsfehler[]) =>
  reply
    .status(400)
    .type('application/problem+json')
    .send(problem(400, 'Ungültige Eingabe', { fehler }));
const nichtGefunden = (reply: FastifyReply) =>
  reply.status(404).type('application/problem+json').send(problem(404, 'Nicht gefunden'));

const ID = {
  type: 'object',
  properties: { id: { type: 'string', pattern: '^[0-9a-fA-F-]{1,36}$' } },
} as const;
const objekt = (pflicht: string[], eigenschaften: Record<string, unknown>) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: pflicht,
    properties: eigenschaften,
  }) as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max });
const OPT_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max });

const terminSchema = objekt(['ortSlug', 'datum', 'titel'], {
  ortSlug: TEXT(120),
  datum: TEXT(10),
  beginn: OPT_TEXT(5),
  titel: TEXT(200),
  veranstaltungsort: OPT_TEXT(120),
  kategorie: OPT_TEXT(20),
  bestaetigt: { type: 'boolean' },
  band: OPT_TEXT(200),
  muttizettel: { type: 'boolean' },
  info: OPT_TEXT(1000),
});
const zeileSchema = {
  ...terminSchema,
  required: ['datum', 'titel'],
  properties: Object.fromEntries(
    Object.entries(terminSchema.properties).filter(([k]) => k !== 'ortSlug'),
  ),
};

declare module 'fastify' {
  interface FastifyRequest {
    sitzung?: Sitzung;
  }
}

export async function adminRouten(app: FastifyInstance, d: AdminAbhaengigkeiten) {
  const ANTWORT = { type: 'object', maxProperties: 10 } as const;
  const TOKEN = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } as const;
  const REGISTRIERUNG = objekt(['vorgang', 'antwort'], { vorgang: TEXT(64), antwort: ANTWORT });
  const keinCache = (reply: FastifyReply) => reply.header('Cache-Control', 'no-store');

  /** Fehler beim Anlegen eines Kontos (Ersteinrichtung oder Einladung) */
  const registrierungsFehler = (reply: FastifyReply, fehler: string) =>
    fehler === 'UNGUELTIG'
      ? reply.status(400).send(problem(400, 'Der Passkey konnte nicht bestätigt werden.'))
      : fehler === 'VERGEBEN' || fehler === 'SCHON_EINGERICHTET'
        ? reply.status(409).send(problem(409, 'Der Zugang ist bereits eingerichtet.'))
        : fehler === 'ZU_VIELE'
          ? reply
              .status(429)
              .header('Retry-After', '3600')
              .send(
                problem(
                  429,
                  'Es wurden schon mehrere Links verschickt – bitte ins Postfach schauen.',
                ),
              )
          : reply
              .status(404)
              .send(problem(404, 'Der Link ist abgelaufen oder wurde schon benutzt.'));

  // ── Anmeldung mit Passkey (ohne Sitzung) ──────────────────────────────────────────────
  const passkeys = d.passkeys;
  if (passkeys) {
    app.post('/api/v1/admin/passkey-anmeldung/optionen', async (_req, reply) => {
      keinCache(reply);
      return passkeys.starteAnmeldung();
    });
    app.post<{ Body: { vorgang: string; antwort: unknown } }>(
      '/api/v1/admin/passkey-anmeldung',
      { bodyLimit: 64 * 1024, schema: { body: REGISTRIERUNG } },
      async (req, reply) => {
        const r = await passkeys.beendeAnmeldung(req.body.vorgang, req.body.antwort);
        keinCache(reply);
        if (r.ok) return r.value;
        req.log.warn({ grund: r.error }, 'Passkey-Anmeldung fehlgeschlagen');
        return r.error === 'GESPERRT'
          ? reply
              .status(429)
              .header('Retry-After', '900')
              .send(problem(429, 'Zu viele Fehlversuche – bitte 15 Minuten warten.'))
          : reply.status(401).send(problem(401, 'Dieser Passkey ist hier nicht eingerichtet.'));
      },
    );
  }

  // ── Ersten Admin einrichten (ohne Sitzung, nur solange es keinen Admin gibt) ─────────
  const einrichtung = d.einrichtung;
  const LINK = { type: 'object', properties: { link: TOKEN } } as const;

  app.get('/api/v1/admin/einrichtung', async (_req, reply) => {
    keinCache(reply);
    return { offen: einrichtung ? await einrichtung.offen() : false, moeglich: !!einrichtung };
  });
  app.post('/api/v1/admin/einrichtung', async (req, reply) => {
    keinCache(reply);
    if (!einrichtung) {
      return reply.status(503).send(problem(503, 'E-Mail-Versand ist nicht eingerichtet.'));
    }
    try {
      const r = await einrichtung.sendeLink();
      if (r.ok) return reply.status(202).send({ verschickt: true });
      return registrierungsFehler(reply, r.error);
    } catch (e) {
      req.log.error({ err: e }, 'Einrichtungslink konnte nicht versendet werden');
      return reply
        .status(502)
        .send(problem(502, 'Die E-Mail konnte gerade nicht versendet werden.'));
    }
  });
  app.get<{ Params: { link: string } }>(
    '/api/v1/admin/einrichtung/:link',
    { schema: { params: LINK } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.pruefeLink(req.params.link);
      return r.ok ? { gueltig: true } : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { link: string }; Body: { name: string } }>(
    '/api/v1/admin/einrichtung/:link/optionen',
    { schema: { params: LINK, body: objekt(['name'], { name: TEXT(200) }) } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.starte(req.params.link, req.body.name);
      if (r.ok) return r.value;
      return Array.isArray(r.error)
        ? ungueltig(reply, r.error)
        : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { link: string }; Body: { vorgang: string; antwort: unknown } }>(
    '/api/v1/admin/einrichtung/:link',
    { bodyLimit: 64 * 1024, schema: { params: LINK, body: REGISTRIERUNG } },
    async (req, reply) => {
      keinCache(reply);
      if (!einrichtung) return nichtGefunden(reply);
      const r = await einrichtung.schliesseAb(req.params.link, req.body.vorgang, req.body.antwort);
      if (!r.ok) return registrierungsFehler(reply, r.error);
      req.log.info('Erster Admin eingerichtet');
      return r.value;
    },
  );

  // ── Einladung annehmen (ohne Sitzung) ─────────────────────────────────────────────────
  const beitritt = d.beitritt;
  const EINLADUNG = { type: 'object', properties: { token: TOKEN } } as const;
  app.get<{ Params: { token: string } }>(
    '/api/v1/admin/einladung/:token',
    { schema: { params: EINLADUNG } },
    async (req, reply) => {
      keinCache(reply);
      const r = beitritt ? await beitritt.pruefe(req.params.token) : null;
      return r?.ok ? r.value : registrierungsFehler(reply, 'ABGELAUFEN');
    },
  );
  app.post<{ Params: { token: string }; Body: { name: string } }>(
    '/api/v1/admin/einladung/:token/optionen',
    { schema: { params: EINLADUNG, body: objekt(['name'], { name: TEXT(200) }) } },
    async (req, reply) => {
      keinCache(reply);
      if (!beitritt) return nichtGefunden(reply);
      const r = await beitritt.starte(req.params.token, req.body.name);
      if (r.ok) return r.value;
      return Array.isArray(r.error)
        ? ungueltig(reply, r.error)
        : registrierungsFehler(reply, r.error);
    },
  );
  app.post<{ Params: { token: string }; Body: { vorgang: string; antwort: unknown } }>(
    '/api/v1/admin/einladung/:token',
    { bodyLimit: 64 * 1024, schema: { params: EINLADUNG, body: REGISTRIERUNG } },
    async (req, reply) => {
      keinCache(reply);
      if (!beitritt) return nichtGefunden(reply);
      const r = await beitritt.beende(req.params.token, req.body.vorgang, req.body.antwort);
      if (!r.ok) return registrierungsFehler(reply, r.error);
      req.log.info('Neues Mitglied über Einladung');
      return { token: r.value.token, stunden: r.value.stunden };
    },
  );

  // ── Alle weiteren Endpunkte: Sitzung prüfen ───────────────────────────────────────────
  const geschuetzt = async (req: FastifyRequest, reply: FastifyReply) => {
    const s = await d.anmeldung.pruefe(sitzungsToken(req.headers.authorization));
    if (!s) return reply.status(401).send(problem(401, 'Bitte anmelden.'));
    req.sitzung = s;
    keinCache(reply);
  };
  const admin = (req: FastifyRequest) => req.sitzung?.adminId ?? '';
  const akteur = (req: FastifyRequest) => req.sitzung as Sitzung;
  const verwaltungsFehler = (reply: FastifyReply, fehler: string) =>
    fehler === 'NUR_ADMIN'
      ? reply.status(403).send(problem(403, 'Nur für Admins.'))
      : fehler === 'LETZTER_ADMIN'
        ? reply
            .status(409)
            .send(
              problem(
                409,
                'Mindestens ein Admin muss bleiben – sonst verwaltet niemand die Redaktion.',
              ),
            )
        : nichtGefunden(reply);

  await app.register(async (r) => {
    // onRequest: Anmeldung prüfen, BEVOR Eingaben validiert werden (keine Rückschlüsse für Nicht-Angemeldete)
    r.addHook('onRequest', geschuetzt);

    r.get('/api/v1/admin/ich', async (req) => ({
      adminId: admin(req),
      name: akteur(req).name,
      rolle: akteur(req).rolle,
      passkeys: !!passkeys,
    }));

    // Passkeys des angemeldeten Mitglieds
    if (passkeys) {
      r.get('/api/v1/admin/passkeys', (req) => passkeys.liste(admin(req)));
      r.post('/api/v1/admin/passkeys/optionen', async (req, reply) => {
        const o = await passkeys.starteEinrichtung(admin(req));
        return o ?? nichtGefunden(reply);
      });
      r.post<{ Body: { vorgang: string; antwort: unknown; name?: string } }>(
        '/api/v1/admin/passkeys',
        {
          bodyLimit: 64 * 1024,
          schema: {
            body: objekt(['vorgang', 'antwort'], {
              vorgang: TEXT(64),
              antwort: ANTWORT,
              name: TEXT(200),
            }),
          },
        },
        async (req, reply) => {
          const p = await passkeys.beendeEinrichtung(
            admin(req),
            req.body.vorgang,
            req.body.antwort,
            req.body.name ?? '',
          );
          return p.ok ? reply.status(201).send(p.value) : ungueltig(reply, p.error);
        },
      );
      r.delete<{ Params: { id: string } }>(
        '/api/v1/admin/passkeys/:id',
        { schema: { params: ID } },
        async (req, reply) => {
          const l = await passkeys.loesche(admin(req), req.params.id);
          if (l.ok) return reply.status(204).send();
          return l.error === 'LETZTER'
            ? reply
                .status(409)
                .send(
                  problem(
                    409,
                    'Der letzte Passkey bleibt – sonst kannst du dich nicht mehr anmelden.',
                  ),
                )
            : nichtGefunden(reply);
        },
      );
    }

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
      r.post<{ Params: { slug: string }; Body: { name: string; standort: string } }>(
        '/api/v1/admin/orte/:slug/festplaetze',
        {
          schema: {
            params: SLUG,
            body: objekt(['name', 'standort'], { name: TEXT(120), standort: TEXT(2000) }),
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
    }

    r.get('/api/v1/admin/vorschlaege', () =>
      d.vorschlaege ? d.vorschlaege() : { bands: [], titel: [] },
    );

    // Mitglieder und Einladungen (nur Admin – geprüft im Use Case)
    const v = d.mitglieder;
    const ROLLE = { type: 'string', enum: ['admin', 'redaktion'] } as const;
    r.get('/api/v1/admin/mitglieder', async (req, reply) => {
      const m = await v.liste(akteur(req));
      return m.ok ? m.value : verwaltungsFehler(reply, m.error);
    });
    r.put<{ Params: { id: string }; Body: { rolle: Rolle } }>(
      '/api/v1/admin/mitglieder/:id/rolle',
      { schema: { params: ID, body: objekt(['rolle'], { rolle: ROLLE }) } },
      async (req, reply) => {
        const m = await v.setzeRolle(akteur(req), req.params.id, req.body.rolle);
        if (!m.ok) return verwaltungsFehler(reply, m.error);
        req.log.info(
          { akteur: admin(req), mitglied: req.params.id, rolle: req.body.rolle },
          'Rolle geändert',
        );
        return reply.status(204).send();
      },
    );
    r.delete<{ Params: { id: string } }>(
      '/api/v1/admin/mitglieder/:id',
      { schema: { params: ID } },
      async (req, reply) => {
        const m = await v.entferne(akteur(req), req.params.id);
        if (!m.ok) return verwaltungsFehler(reply, m.error);
        req.log.info({ akteur: admin(req), mitglied: req.params.id }, 'Mitglied entfernt');
        return reply.status(204).send();
      },
    );
    r.get('/api/v1/admin/einladungen', async (req, reply) => {
      const m = await v.offeneEinladungen(akteur(req));
      return m.ok ? m.value : verwaltungsFehler(reply, m.error);
    });
    r.post<{ Body: { rolle: Rolle } }>(
      '/api/v1/admin/einladungen',
      { schema: { body: objekt(['rolle'], { rolle: ROLLE }) } },
      async (req, reply) => {
        const m = await v.lade(akteur(req), req.body.rolle);
        if (!m.ok) return verwaltungsFehler(reply, m.error);
        // Das Token selbst wird nie geloggt
        req.log.info(
          { akteur: admin(req), einladung: m.value.id, rolle: m.value.rolle },
          'Einladung erstellt',
        );
        return reply.status(201).send(m.value);
      },
    );
    r.delete<{ Params: { id: string } }>(
      '/api/v1/admin/einladungen/:id',
      { schema: { params: ID } },
      async (req, reply) => {
        const m = await v.widerrufe(akteur(req), req.params.id);
        if (!m.ok) return verwaltungsFehler(reply, m.error);
        req.log.info({ akteur: admin(req), einladung: req.params.id }, 'Einladung widerrufen');
        return reply.status(204).send();
      },
    );

    r.post('/api/v1/admin/abmelden', async (req, reply) => {
      await d.anmeldung.abmelden(sitzungsToken(req.headers.authorization));
      return reply.status(204).send();
    });

    // Mitteilungen
    r.get('/api/v1/admin/mitteilungen', () => d.redaktion.listeMitteilungen());
    r.post<{ Body: MitteilungEingabe & { sofort?: boolean } }>(
      '/api/v1/admin/mitteilungen',
      {
        schema: {
          body: objekt(['titel', 'text'], {
            titel: TEXT(200),
            text: TEXT(4000),
            link: OPT_TEXT(500),
            sofort: { type: 'boolean' },
          }),
        },
      },
      async (req, reply) => {
        const m = await d.redaktion.legeMitteilung(req.body, admin(req));
        if (!m.ok) return ungueltig(reply, m.error);
        if (req.body.sofort) await d.redaktion.veroeffentliche(m.value.id, true);
        return reply.status(201).send(m.value);
      },
    );
    r.post<{ Params: { id: string }; Body: { an: boolean } }>(
      '/api/v1/admin/mitteilungen/:id/veroeffentlichen',
      { schema: { params: ID, body: objekt(['an'], { an: { type: 'boolean' } }) } },
      async (req, reply) =>
        (await d.redaktion.veroeffentliche(req.params.id, req.body.an))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );
    r.delete<{ Params: { id: string } }>(
      '/api/v1/admin/mitteilungen/:id',
      { schema: { params: ID } },
      async (req, reply) =>
        (await d.redaktion.loescheMitteilung(req.params.id))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );

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

    // Termine (jeder Ort)
    r.post<{ Body: AdminTerminFormular }>(
      '/api/v1/admin/termine',
      { schema: { body: terminSchema } },
      async (req, reply) => {
        const t = await d.redaktion.legeTermin(req.body, admin(req));
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
        schema: {
          body: objekt(['ortSlug', 'zeilen'], {
            ortSlug: TEXT(120),
            zeilen: { type: 'array', minItems: 1, maxItems: 20, items: zeileSchema },
          }),
        },
      },
      async (req, reply) => {
        const t = await d.redaktion.legeWochenende(req.body.ortSlug, req.body.zeilen, admin(req));
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
        const t = await d.redaktion.bearbeiteKirmes(req.body.ortSlug, req.body.zeilen, admin(req));
        if (t.ok) return t.value;
        return t.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, t.error);
      },
    );
    r.put<{ Params: { id: string }; Body: AdminTerminFormular }>(
      '/api/v1/admin/termine/:id',
      { schema: { params: ID, body: terminSchema } },
      async (req, reply) => {
        const t = await d.redaktion.aendereTermin(req.params.id, req.body, admin(req));
        if (t.ok) return t.value;
        return t.error === 'NICHT_GEFUNDEN' ? nichtGefunden(reply) : ungueltig(reply, t.error);
      },
    );
    r.post<{ Params: { id: string }; Body: { ortSlug: string } }>(
      '/api/v1/admin/termine/:id/bestaetigen',
      { schema: { params: ID, body: objekt(['ortSlug'], { ortSlug: TEXT(120) }) } },
      async (req, reply) =>
        (await d.redaktion.bestaetigeTermin(req.params.id, req.body.ortSlug, admin(req)))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );
    r.delete<{ Params: { id: string }; Querystring: { ort: string } }>(
      '/api/v1/admin/termine/:id',
      { schema: { params: ID, querystring: objekt(['ort'], { ort: TEXT(120) }) } },
      async (req, reply) =>
        (await d.redaktion.loescheTermin(req.params.id, req.query.ort, admin(req)))
          ? reply.status(204).send()
          : nichtGefunden(reply),
    );

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
  });
}
