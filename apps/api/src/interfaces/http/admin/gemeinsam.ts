/** Gemeinsame Bausteine der Redaktions-API (Issue #199). */
import type {
  AdminAnmeldung,
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  MitmachAnfragen,
  Passkeys,
  Redaktion,
  RedaktionsTermine,
  RedaktionsFestplaetze,
  Sitzung,
  Termin,
  TerminHerkunft,
  Validierungsfehler,
} from '@kirmes/core';
import type { FastifyReply } from 'fastify';
import { vorschlagsZeileSchema } from '../vorschlag-routen.js';

export interface AdminAbhaengigkeiten {
  anmeldung: AdminAnmeldung;
  redaktion: Redaktion;
  terminListe?: RedaktionsTermine;
  terminFinden?: (id: string) => Promise<Termin | null>;
  terminDto: (t: Termin) => unknown;
  terminHerkunft?: (
    ids: string[],
    ortSlug?: string | null,
  ) => Promise<Record<string, TerminHerkunft>>;
  /** Passkeys sind optional (fehlt WEBSITE_URL, bleibt es bei Passwort + Einmalcode) */
  passkeys?: Passkeys;
  /** Erster Admin im Browser – braucht E-Mail-Versand und WEBSITE_URL */
  einrichtung?: Ersteinrichtung;
  /** Einladung annehmen – braucht WEBSITE_URL (Passkeys) */
  beitritt?: Beitritt;
  mitglieder: Mitgliederverwaltung;
  /** Mitmach-Anfragen (Issue #279) – braucht E-Mail-Versand und WEBSITE_URL */
  anfragen?: MitmachAnfragen;
  /** Plätze eines Ortes (Kirche, Festzelt …) mit Standort – Issue #62 */
  festplaetze?: RedaktionsFestplaetze;
  /** Eingabe-Vorschläge (Bands, Titel) aus allen Terminen */
  vorschlaege?: () => Promise<{ bands: string[]; titel: string[] }>;
  /** Stand der Datenbanksicherungen (nur Admins) – Issue #45 */
  sicherungen?: () => Promise<unknown>;
}

export const problem = (status: number, title: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});
export const sitzungsToken = (h: string | undefined) =>
  h?.startsWith('Sitzung ') ? h.slice(8).trim() : '';
export const ungueltig = (reply: FastifyReply, fehler: Validierungsfehler[]) =>
  reply
    .status(400)
    .type('application/problem+json')
    .send(problem(400, 'Ungültige Eingabe', { fehler }));
export const nichtGefunden = (reply: FastifyReply) =>
  reply.status(404).type('application/problem+json').send(problem(404, 'Nicht gefunden'));

export const ID = {
  type: 'object',
  properties: { id: { type: 'string', pattern: '^[0-9a-fA-F-]{1,36}$' } },
} as const;
export const objekt = (pflicht: string[], eigenschaften: Record<string, unknown>) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: pflicht,
    properties: eigenschaften,
  }) as const;
export const TEXT = (max: number) => ({ type: 'string', maxLength: max });
export const OPT_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max });

export const terminSchema = objekt(['ortSlug', 'datum', 'titel'], {
  version: TEXT(80),
  ortSlug: TEXT(120),
  datum: TEXT(10),
  beginn: OPT_TEXT(5),
  titel: TEXT(200),
  veranstaltungsort: OPT_TEXT(120),
  kategorie: OPT_TEXT(20),
  bestaetigt: { type: 'boolean' },
  band: OPT_TEXT(200),
  pfarrer: OPT_TEXT(120),
  veranstalter: OPT_TEXT(200),
  ende: OPT_TEXT(5),
  eintritt: OPT_TEXT(20),
  muttizettel: { type: 'boolean' },
  info: OPT_TEXT(1000),
  speisen: vorschlagsZeileSchema.properties.speisen,
});
export const zeileSchema = {
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
