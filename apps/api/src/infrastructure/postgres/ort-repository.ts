import type {
  KalenderDatum,
  LandkreisKuerzel,
  Ort,
  OrtRepository,
  OrtUebersicht,
  Kartenausschnitt,
} from '@kirmes/core';
import type pg from 'pg';
import { abfrage } from './pool.js';

const SQL_LISTE = `
SELECT o.slug, o.name, o.landkreis,
       ST_Y(o.lage::geometry) AS lat, ST_X(o.lage::geometry) AS lon,
       count(t.id) FILTER (WHERE t.datum >= $1::date) AS kommend
  FROM ort o
  LEFT JOIN termin t ON t.ort_id = o.id
 -- Kartenausschnitt optional; && nutzt den GiST-Index auf ort.lage
 WHERE ($2::float8 IS NULL OR o.lage && ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography)
 GROUP BY o.id
 ORDER BY o.name`;

const SQL_FINDE = `
SELECT slug, name, landkreis, ST_Y(lage::geometry) AS lat, ST_X(lage::geometry) AS lon
  FROM ort WHERE slug = $1`;

interface Zeile {
  slug: string;
  name: string;
  landkreis: LandkreisKuerzel;
  lat: number | null;
  lon: number | null;
}

const zuOrt = (z: Zeile): Ort => ({
  slug: z.slug,
  name: z.name,
  landkreis: z.landkreis,
  koordinate: z.lat != null && z.lon != null ? { lat: z.lat, lon: z.lon } : null,
});

export class PgOrtRepository implements OrtRepository {
  constructor(private readonly db: pg.Pool) {}

  async liste(ab: KalenderDatum, a?: Kartenausschnitt | null): Promise<OrtUebersicht[]> {
    const { rows } = await abfrage<Zeile & { kommend: string }>(this.db, SQL_LISTE, [
      ab,
      a?.minLon ?? null,
      a?.minLat ?? null,
      a?.maxLon ?? null,
      a?.maxLat ?? null,
    ]);
    return rows.map((z) => ({ ort: zuOrt(z), anzahlKommend: Number(z.kommend) }));
  }

  async finde(slug: string): Promise<Ort | null> {
    const { rows } = await abfrage<Zeile>(this.db, SQL_FINDE, [slug]);
    return rows[0] ? zuOrt(rows[0]) : null;
  }
}
