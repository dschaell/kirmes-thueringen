/** Gemeinsame Antworten und Helfer der öffentlichen API (Issue #199). */
import type { Termin } from '@kirmes/core';

export const liste = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(',')).filter(Boolean);

/**
 * Aufrufer aus privaten Netzen (Website-Container, localhost) sind vom Rate-Limit ausgenommen:
 * Die API ist nicht öffentlich erreichbar, alle Seitenaufrufe kommen über den Web-Server.
 */

export const problem = (status: number, title: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});

export const terminDto = (t: Termin) => ({
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
  veranstalter: t.veranstalter ?? null,
  ende: t.ende ?? null,
  eintrittCent: t.eintrittCent ?? null,
  muttizettel: t.muttizettel,
  info: t.info,
  // Letzte Änderung – Kalender-Abos erkennen damit Änderungen (Issue #139)
  geaendertAm: t.geaendertAm,
  // Mittagstisch nur in der Einzelansicht
  ...(t.speisen && { speisen: t.speisen }),
});

/** „Authorization: Bearer <token>“ → token */
export const bearer = (h: string | undefined): string =>
  h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
