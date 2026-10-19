import type { TerminHerkunft } from '@kirmes/core';
import type pg from 'pg';
import { abfrage } from './pool.js';

/** Ausschließlich für die geschützte Redaktions-API, nie Teil öffentlicher Termin-Daten. */
export async function terminHerkunft(
  db: pg.Pool,
  ids: string[],
): Promise<Record<string, TerminHerkunft>> {
  const { rows } = await abfrage<{
    id: string;
    name: string | null;
    zeit: string | null;
    link: boolean;
    vorschlag: boolean;
    g_name: string | null;
    g_zeit: string | null;
    g_link: boolean;
  }>(
    db,
    `SELECT t.id::text, COALESCE(a.name, b.bezeichnung) AS name, p.zeit::text, p.link_id IS NOT NULL AS link,
            COALESCE(p.details ? 'vorschlag', false) AS vorschlag,
            COALESCE(ga.name, gb.bezeichnung) AS g_name, g.zeit::text AS g_zeit,
            g.link_id IS NOT NULL AS g_link
       FROM termin t
       LEFT JOIN LATERAL (
         SELECT admin_id, link_id, zeit, details FROM aenderungsprotokoll
          WHERE aktion = 'termin_angelegt' AND details->>'id' = t.id::text
            AND zeit = t.erstellt_am
          ORDER BY id LIMIT 1
       ) p ON true
       LEFT JOIN admin a ON a.id = p.admin_id
       LEFT JOIN bearbeitungslink b ON b.id = p.link_id
       -- Letzte Bearbeitung (Issue #181)
       LEFT JOIN LATERAL (
         SELECT admin_id, link_id, zeit FROM aenderungsprotokoll
          WHERE aktion IN ('termin_geaendert', 'termin_bestaetigt') AND details->>'id' = t.id::text
          ORDER BY id DESC LIMIT 1
       ) g ON true
       LEFT JOIN admin ga ON ga.id = g.admin_id
       LEFT JOIN bearbeitungslink gb ON gb.id = g.link_id
      WHERE t.id = ANY($1::uuid[])`,
    [ids],
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        name: r.name,
        angelegtAm: r.zeit,
        weg: r.vorschlag
          ? 'vorschlag'
          : r.link
            ? 'bearbeitungslink'
            : r.name
              ? 'redaktion'
              : 'unbekannt',
        geaendert: r.g_zeit
          ? { name: r.g_name, am: r.g_zeit, weg: r.g_link ? 'bearbeitungslink' : 'redaktion' }
          : null,
      },
    ]),
  );
}
