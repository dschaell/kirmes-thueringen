import {
  PersistenzNichtVerfuegbar,
  type Kategorie,
  type KalenderDatum,
  type LandkreisKuerzel,
  type NeuerTermin,
  type Seite,
  type Termin,
  type TerminFilter,
  type TerminRepository,
} from '@kirmes/core';
import type pg from 'pg';
import { istVerbindungsfehler } from './pool.js';

/*
 * Alle Statements sind konstante Strings mit Platzhaltern ($1 …). Benutzereingaben gelangen
 * ausschließlich als Parameter zum Server – niemals per String-Verkettung (OWASP A03).
 * Optionale Filter werden über "leeres Array / NULL = kein Filter" ausgedrückt, damit das SQL statisch bleibt.
 */
const SQL_SUCHE = `
SELECT t.id, t.datum::text AS datum, to_char(t.beginn, 'HH24:MI') AS beginn, t.titel,
       t.veranstaltungsort, t.kategorie, t.bestaetigt,
       o.slug AS ort_slug, o.name AS ort_name, o.landkreis,
       ST_Y(o.lage::geometry) AS lat, ST_X(o.lage::geometry) AS lon,
       count(*) OVER () AS gesamt
  FROM termin t
  JOIN ort o ON o.id = t.ort_id
 WHERE t.datum BETWEEN $1::date AND $2::date
   AND (cardinality($3::text[]) = 0 OR o.landkreis = ANY ($3::text[]))
   AND (cardinality($4::text[]) = 0 OR t.kategorie = ANY ($4::text[]))
   AND ($5::text IS NULL
        OR t.titel ILIKE $5 ESCAPE '\\'
        OR o.name ILIKE $5 ESCAPE '\\'
        OR t.veranstaltungsort ILIKE $5 ESCAPE '\\')
   AND (NOT $6::boolean OR t.bestaetigt)
 ORDER BY t.datum, t.beginn NULLS LAST, o.name, t.titel
 LIMIT $7 OFFSET $8`;

const SQL_ORT_ID = `SELECT id, name FROM ort WHERE slug = $1 AND landkreis = $2`;

const SQL_EINFUEGEN = `
INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt)
VALUES ($1, $2::date, $3::time, $4, $5, $6, $7)
RETURNING id`;

interface Zeile {
  id: string;
  datum: string;
  beginn: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: Kategorie;
  bestaetigt: boolean;
  ort_slug: string;
  ort_name: string;
  landkreis: LandkreisKuerzel;
  lat: number | null;
  lon: number | null;
  gesamt: string;
}

/** Escaped LIKE-Metazeichen, damit „%“ oder „_“ in der Suche wörtlich gemeint sind. */
export const alsLikeMuster = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const zuTermin = (z: Zeile): Termin => ({
  id: z.id,
  ort: {
    slug: z.ort_slug,
    name: z.ort_name,
    landkreis: z.landkreis,
    koordinate: z.lat != null && z.lon != null ? { lat: z.lat, lon: z.lon } : null,
  },
  datum: z.datum as KalenderDatum,
  beginn: z.beginn,
  titel: z.titel,
  veranstaltungsort: z.veranstaltungsort,
  kategorie: z.kategorie,
  bestaetigt: z.bestaetigt,
});

export class OrtNichtGefunden extends Error {
  constructor(slug: string) {
    super(`Ort „${slug}“ existiert nicht.`);
    this.name = 'OrtNichtGefunden';
  }
}

export class PgTerminRepository implements TerminRepository {
  constructor(private readonly db: pg.Pool) {}

  private async abfrage<R extends pg.QueryResultRow>(sql: string, werte: unknown[]) {
    try {
      return await this.db.query<R>(sql, werte);
    } catch (e) {
      if (istVerbindungsfehler(e)) throw new PersistenzNichtVerfuegbar({ cause: e });
      throw e;
    }
  }

  async suche(f: TerminFilter): Promise<Seite<Termin>> {
    const { rows } = await this.abfrage<Zeile>(SQL_SUCHE, [
      f.bereich.von,
      f.bereich.bis,
      f.landkreise,
      f.kategorien,
      f.suchtext ? alsLikeMuster(f.suchtext) : null,
      f.nurBestaetigt,
      f.limit,
      f.offset,
    ]);
    return { eintraege: rows.map(zuTermin), gesamt: Number(rows[0]?.gesamt ?? 0) };
  }

  async speichere(t: NeuerTermin): Promise<Termin> {
    const ort = await this.abfrage<{ id: string; name: string }>(SQL_ORT_ID, [
      t.ortSlug,
      t.landkreis,
    ]);
    const o = ort.rows[0];
    if (!o) throw new OrtNichtGefunden(t.ortSlug);
    const { rows } = await this.abfrage<{ id: string }>(SQL_EINFUEGEN, [
      o.id,
      t.datum,
      t.beginn,
      t.titel,
      t.veranstaltungsort,
      t.kategorie,
      t.bestaetigt,
    ]);
    const neu = rows[0];
    if (!neu) throw new Error('INSERT lieferte keine ID');
    return {
      id: neu.id,
      ort: { slug: t.ortSlug, name: o.name, landkreis: t.landkreis, koordinate: null },
      datum: t.datum,
      beginn: t.beginn,
      titel: t.titel,
      veranstaltungsort: t.veranstaltungsort,
      kategorie: t.kategorie,
      bestaetigt: t.bestaetigt,
    };
  }
}

export async function datenbankErreichbar(db: pg.Pool): Promise<boolean> {
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
