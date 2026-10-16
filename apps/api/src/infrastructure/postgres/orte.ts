/**
 * CLI: lädt das Ortsverzeichnis (db/seed/orte.json, aus OpenStreetMap) in die Tabelle „ort“.
 * Vorhandene Orte werden aktualisiert (Name, Landkreis, Koordinate), nie gelöscht.
 */
import { normalisiereOrtsname, parseKoordinate } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import { ladeKonfiguration } from '../../config.js';
import { erstellePool } from './pool.js';

interface OrtEintrag {
  slug: string;
  name: string;
  landkreis: string;
  lat: number;
  lon: number;
}

const datei = new URL('../../../../../db/seed/orte.json', import.meta.url);
const alle = JSON.parse(await readFile(datei, 'utf8')) as OrtEintrag[];
// Domänenregel: Koordinaten außerhalb Thüringens (oder vertauschte Werte) werden verworfen
const orte = alle.filter((o) => parseKoordinate(o.lat, o.lon).ok);
if (orte.length < alle.length) {
  console.warn(
    `⚠ ${alle.length - orte.length} Orte mit Koordinaten außerhalb Thüringens verworfen`,
  );
}
const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 120_000,
});
try {
  const r = await pool.query(
    `INSERT INTO ort (slug, name, landkreis, lage)
     SELECT s, n, l, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
       FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[]) AS t(s, n, l, lat, lon)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, landkreis = EXCLUDED.landkreis, lage = EXCLUDED.lage
       WHERE ort.herkunft = 'osm' -- von der Redaktion angelegte Orte bleiben unverändert`,
    [
      orte.map((o) => o.slug),
      orte.map((o) => normalisiereOrtsname(o.name)),
      orte.map((o) => o.landkreis),
      orte.map((o) => o.lat),
      orte.map((o) => o.lon),
    ],
  );
  console.log(`✔ ${r.rowCount} Orte geladen (© OpenStreetMap-Mitwirkende, ODbL)`);
} finally {
  await pool.end();
}
