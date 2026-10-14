/** CLI: spielt db/migrations/*.sql in Reihenfolge ein (je Datei eine Transaktion) und synchronisiert Stammdaten. */
import { LANDKREISE } from '@kirmes/core';
import { readdir, readFile } from 'node:fs/promises';
import { ladeKonfiguration } from '../../config.js';
import { erstellePool } from './pool.js';

const VERZEICHNIS = new URL('../../../../../db/migrations/', import.meta.url);

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 60_000,
});
const client = await pool.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migration (datei text PRIMARY KEY, eingespielt_am timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await client.query<{ datei: string }>('SELECT datei FROM schema_migration');
  const erledigt = new Set(rows.map((r) => r.datei));
  const dateien = (await readdir(VERZEICHNIS)).filter((f) => f.endsWith('.sql')).sort();

  for (const datei of dateien) {
    if (erledigt.has(datei)) continue;
    const sql = await readFile(new URL(datei, VERZEICHNIS), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql); // Inhalt stammt aus dem Repository, nicht aus Benutzereingaben
      await client.query('INSERT INTO schema_migration (datei) VALUES ($1)', [datei]);
      await client.query('COMMIT');
      console.log(`✔ ${datei}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }

  // Landkreise: eine Quelle der Wahrheit (Core) – DB wird daraus abgeleitet.
  for (const [kuerzel, name] of Object.entries(LANDKREISE)) {
    await client.query(
      'INSERT INTO landkreis (kuerzel, name) VALUES ($1, $2) ON CONFLICT (kuerzel) DO UPDATE SET name = EXCLUDED.name',
      [kuerzel, name],
    );
  }
  console.log(`✔ ${Object.keys(LANDKREISE).length} Landkreise synchronisiert`);
} finally {
  client.release();
  await pool.end();
}
