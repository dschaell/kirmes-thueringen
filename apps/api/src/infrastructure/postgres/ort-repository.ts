import type {
  KalenderDatum,
  LandkreisKuerzel,
  Ort,
  OrtRepository,
  Ortsprofil,
  OrtsprofilAblage,
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
SELECT slug, name, landkreis, ST_Y(lage::geometry) AS lat, ST_X(lage::geometry) AS lon,
       kg_name, kg_text, kg_website, kg_instagram, kg_facebook, kg_kontakt
  FROM ort WHERE slug = $1`;

/** Vereinsprofil speichern (Issue #310) – samt Eintrag im Änderungsprotokoll */
const SQL_PROFIL = `
WITH o AS (
  UPDATE ort SET kg_text = $2, kg_website = $3, kg_instagram = $4, kg_facebook = $5, kg_kontakt = $6
   WHERE slug = $1 RETURNING id
)
INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details)
SELECT $7, id, 'ortsprofil_geaendert', '{}'::jsonb FROM o`;

interface ProfilZeile {
  kg_name: string | null;
  kg_text: string | null;
  kg_website: string | null;
  kg_instagram: string | null;
  kg_facebook: string | null;
  kg_kontakt: string | null;
}

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

export class PgOrtRepository implements OrtRepository, OrtsprofilAblage {
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
    const { rows } = await abfrage<Zeile & ProfilZeile>(this.db, SQL_FINDE, [slug]);
    const z = rows[0];
    if (!z) return null;
    const profil = {
      text: z.kg_text,
      website: z.kg_website,
      instagram: z.kg_instagram,
      facebook: z.kg_facebook,
      kontakt: z.kg_kontakt,
    };
    return {
      ...zuOrt(z),
      kgName: z.kg_name,
      profil: Object.values(profil).some(Boolean) ? profil : null,
    };
  }

  async setze(ortSlug: string, p: Ortsprofil, adminId: string): Promise<boolean> {
    const r = await abfrage(this.db, SQL_PROFIL, [
      ortSlug,
      p.text,
      p.website,
      p.instagram,
      p.facebook,
      p.kontakt,
      adminId,
    ]);
    return r.rowCount === 1;
  }
}
