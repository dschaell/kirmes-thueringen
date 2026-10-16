/**
 * Erststart ohne Server-Shell (Issue #42): Auf dem Server deployt ein GitOps-Agent, niemand führt
 * dort CLIs aus. Deshalb kann „migrate“ das Ortsverzeichnis laden (idempotent). Den ersten
 * Redaktionszugang richtet man im Browser ein (/admin/einrichten, Issue #48).
 */
import { normalisiereOrtsname, parseKoordinate } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';

type Db = Pick<pg.ClientBase, 'query'>;

// ── Ortsverzeichnis ─────────────────────────────────────────────────────────────────────
export interface OrtEintrag {
  slug: string;
  name: string;
  landkreis: string;
  lat: number;
  lon: number;
}

export const ORTE_DATEI = new URL('../../../../../db/seed/orte.json', import.meta.url);

/** Liest das Ortsverzeichnis; Koordinaten außerhalb Thüringens (oder vertauschte) werden verworfen. */
export async function leseOrtsverzeichnis(
  datei: URL = ORTE_DATEI,
): Promise<{ orte: OrtEintrag[]; verworfen: number }> {
  const alle = JSON.parse(await readFile(datei, 'utf8')) as OrtEintrag[];
  const orte = alle.filter((o) => parseKoordinate(o.lat, o.lon).ok);
  return { orte, verworfen: alle.length - orte.length };
}

const SQL_ORTE = `
INSERT INTO ort (slug, name, landkreis, lage)
SELECT s, n, l, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[]) AS t(s, n, l, lat, lon)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, landkreis = EXCLUDED.landkreis, lage = EXCLUDED.lage
  WHERE ort.herkunft = 'osm' -- von der Redaktion angelegte Orte bleiben unverändert`;

/** Lädt bzw. aktualisiert Orte (nie löschen). Liefert die Zahl eingefügter/aktualisierter Zeilen. */
export async function ladeOrte(db: Db, orte: OrtEintrag[]): Promise<number> {
  const r = await db.query(SQL_ORTE, [
    orte.map((o) => o.slug),
    orte.map((o) => normalisiereOrtsname(o.name)),
    orte.map((o) => o.landkreis),
    orte.map((o) => o.lat),
    orte.map((o) => o.lon),
  ]);
  return r.rowCount ?? 0;
}

/** ORTE_LADEN=ja → Ortsverzeichnis beim Migrieren laden (Server). Lokal bleibt es bei npm run db:orte. */
export const sollOrteLaden = (env: NodeJS.ProcessEnv = process.env) =>
  env.ORTE_LADEN?.trim().toLowerCase() === 'ja';
