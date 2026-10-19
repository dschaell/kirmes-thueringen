import {
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
import { abfrage } from './pool.js';

/*
 * Alle Statements sind konstante Strings mit Platzhaltern ($1 …). Benutzereingaben gelangen
 * ausschließlich als Parameter zum Server – niemals per String-Verkettung (OWASP A03).
 * Optionale Filter werden über "leeres Array / NULL = kein Filter" ausgedrückt, damit das SQL statisch bleibt.
 */
/** Spalten und Joins eines Termins inkl. Ort und Festplatz – nur für bereits ausgewählte Termine. */
const SQL_TERMIN_DETAILS = `
SELECT t.id, t.version::text AS version,
       to_char(t.geaendert_am AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS geaendert_am,
       t.datum::text AS datum, to_char(t.beginn, 'HH24:MI') AS beginn, t.titel,
       t.veranstaltungsort, t.kategorie, t.bestaetigt, t.band, t.info, t.muttizettel,
       o.slug AS ort_slug, o.name AS ort_name, o.landkreis,
       ST_Y(o.lage::geometry) AS lat, ST_X(o.lage::geometry) AS lon,
       ST_Y(f.lage::geometry) AS f_lat, ST_X(f.lage::geometry) AS f_lon`;
const SQL_TERMIN_JOINS = `
  JOIN ort o ON o.id = t.ort_id
  -- Festplatz: passender Veranstaltungsort, sonst Standard-Festplatz ('') des Ortes.
  -- Issue #157: Ständchen ziehen durch den ganzen Ort (nur ein ausdrücklich genannter Platz); kirchliche Termine
  -- (wie istKirchlich im Core) nie zum Festplatz, sondern zu einem Platz „Kirche…“.
  LEFT JOIN LATERAL (
    SELECT fp.lage FROM festplatz fp
     CROSS JOIN LATERAL (SELECT
       (t.kategorie = 'tradition' AND t.titel ~* '(gottesdienst|andacht|messe\\M|kirchgang)')
       OR coalesce(t.veranstaltungsort, '') ~* 'kirche' AS kirchlich) k
     WHERE fp.ort_id = t.ort_id
       AND (fp.name = t.veranstaltungsort
            OR (t.kategorie <> 'staendchen'
                AND CASE WHEN k.kirchlich THEN fp.name ~* '^kirche' ELSE fp.name = '' END))
     ORDER BY (fp.name = t.veranstaltungsort) DESC NULLS LAST, fp.name
     LIMIT 1
  ) f ON true`;

/*
 * Zwei Schritte: Erst Treffer filtern, zählen und auf eine Seite kürzen (nur termin + ort), dann
 * nur für diese Seite Details und Festplatz laden. Vorher lief die Festplatz-Unterabfrage für
 * jeden Treffer des Jahres – bei 10.000 Terminen ~1 s statt weniger Millisekunden.
 */
const SQL_SUCHE = `
WITH seite AS (
  SELECT t.id, count(*) OVER () AS gesamt
    FROM termin t
    JOIN ort o ON o.id = t.ort_id
   WHERE t.datum BETWEEN $1::date AND $2::date
     AND (cardinality($3::text[]) = 0 OR o.landkreis = ANY ($3::text[]))
     AND (cardinality($4::text[]) = 0 OR t.kategorie = ANY ($4::text[]))
     -- Freitext: Trigramm-Index auf termin.suchtext (Titel, Veranstaltungsort, Band) und ort.name;
     -- der Ort als Unterabfrage, damit beide Indizes per BitmapOr kombiniert werden können
     AND ($5::text IS NULL
          OR t.suchtext ILIKE $5 ESCAPE '\\'
          OR t.ort_id = ANY (ARRAY(SELECT id FROM ort WHERE name ILIKE $5 ESCAPE '\\')))
     AND (NOT $6::boolean OR t.bestaetigt)
     AND ($9::text IS NULL OR o.slug = $9)
   ORDER BY t.datum, t.beginn NULLS LAST, o.name, t.titel
   LIMIT $7 OFFSET $8
)
${SQL_TERMIN_DETAILS}, s.gesamt
  FROM seite s
  JOIN termin t ON t.id = s.id
${SQL_TERMIN_JOINS}
 ORDER BY t.datum, t.beginn NULLS LAST, o.name, t.titel`;

/** Für den EXPLAIN-Regressionstest: Plan der Suche als JSON. */
export const SQL_SUCHE_EXPLAIN = `EXPLAIN (FORMAT JSON) ${SQL_SUCHE}`;

const SQL_FINDE = `${SQL_TERMIN_DETAILS}, 1 AS gesamt FROM termin t ${SQL_TERMIN_JOINS} WHERE t.id = $1::uuid`;

const SQL_ORT_ID = `SELECT id, name FROM ort WHERE slug = $1 AND landkreis = $2`;

const SQL_EINFUEGEN = `
INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, band, info,
                    muttizettel)
VALUES ($1, $2::date, $3::time, $4, $5, $6, $7, $8, $9, $10)
RETURNING id`;

interface Zeile {
  version: string;
  geaendert_am: string;
  id: string;
  datum: string;
  beginn: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: Kategorie;
  bestaetigt: boolean;
  band: string | null;
  info: string | null;
  muttizettel: boolean;
  ort_slug: string;
  ort_name: string;
  landkreis: LandkreisKuerzel;
  lat: number | null;
  lon: number | null;
  f_lat: number | null;
  f_lon: number | null;
  gesamt: string;
}

/** Escaped LIKE-Metazeichen, damit „%“ oder „_“ in der Suche wörtlich gemeint sind. */
export const alsLikeMuster = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const zuTermin = (z: Zeile): Termin => ({
  id: z.id,
  version: z.version,
  geaendertAm: z.geaendert_am, // NOT NULL in der Datenbank
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
  band: z.band,
  info: z.info,
  muttizettel: z.muttizettel,
  festplatz: z.f_lat != null && z.f_lon != null ? { lat: z.f_lat, lon: z.f_lon } : null,
});

const SQL_SPEISEN = `
SELECT name, preis_cent FROM termin_speise WHERE termin_id = $1::uuid ORDER BY position`;

export class OrtNichtGefunden extends Error {
  constructor(slug: string) {
    super(`Ort „${slug}“ existiert nicht.`);
    this.name = 'OrtNichtGefunden';
  }
}

export class PgTerminRepository implements TerminRepository {
  constructor(private readonly db: pg.Pool) {}

  private abfrage<R extends pg.QueryResultRow>(sql: string, werte: unknown[]) {
    return abfrage<R>(this.db, sql, werte);
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
      f.ortSlug,
    ]);
    return { eintraege: rows.map(zuTermin), gesamt: Number(rows[0]?.gesamt ?? 0) };
  }

  async finde(id: string): Promise<Termin | null> {
    const { rows } = await this.abfrage<Zeile>(SQL_FINDE, [id]);
    if (!rows[0]) return null;
    // Mittagstisch nur in der Einzelansicht (Issue #66)
    const speisen = await this.abfrage<{ name: string; preis_cent: number | null }>(SQL_SPEISEN, [
      id,
    ]);
    return {
      ...zuTermin(rows[0]),
      speisen: speisen.rows.map((s) => ({ name: s.name, preisCent: s.preis_cent })),
    };
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
      t.band,
      t.info,
      t.muttizettel ?? false,
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
      festplatz: null,
      band: t.band,
      info: t.info,
      muttizettel: t.muttizettel ?? false,
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
