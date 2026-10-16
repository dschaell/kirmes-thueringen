/**
 * CLI: lädt das Ortsverzeichnis (db/seed/orte.json, aus OpenStreetMap) in die Tabelle „ort“.
 * Vorhandene Orte werden aktualisiert (Name, Landkreis, Koordinate), nie gelöscht.
 */
import { ladeKonfiguration } from '../../config.js';
import { ladeOrte, leseOrtsverzeichnis } from './erststart.js';
import { erstellePool } from './pool.js';

const { orte, verworfen } = await leseOrtsverzeichnis();
if (verworfen) console.warn(`⚠ ${verworfen} Orte mit Koordinaten außerhalb Thüringens verworfen`);
const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 120_000,
});
try {
  const n = await ladeOrte(pool, orte);
  console.log(`✔ ${n} Orte geladen (© OpenStreetMap-Mitwirkende, ODbL)`);
} finally {
  await pool.end();
}
