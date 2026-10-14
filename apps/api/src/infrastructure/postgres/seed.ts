/**
 * CLI: lädt db/seed/termine.json (lokaler Import, nicht im Repo) oder ersatzweise
 * db/seed/termine.beispiel.json. Jeder Datensatz läuft durch die Domänen-Validierung.
 */
import { validiereTermin } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import { ladeKonfiguration } from '../../config.js';
import { erstellePool } from './pool.js';

interface SeedTermin {
  datum: string | null;
  bestaetigt: boolean;
  zeit: string | null;
  ort: string;
  ortSlug: string;
  kreis: string | null;
  location: string | null;
  titel: string;
  kategorie: string;
}

const SEED = new URL('../../../../../db/seed/', import.meta.url);

async function ladeSeed(): Promise<{ datei: string; daten: SeedTermin[] }> {
  for (const datei of ['termine.json', 'termine.beispiel.json']) {
    try {
      return { datei, daten: JSON.parse(await readFile(new URL(datei, SEED), 'utf8')) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  throw new Error('Keine Seed-Datei gefunden');
}

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 60_000,
});
const { datei, daten } = await ladeSeed();
let ok = 0;
const verworfen: Record<string, number> = {};

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const s of daten) {
    const v = validiereTermin({
      ortSlug: s.ortSlug,
      landkreis: s.kreis ?? '',
      datum: s.datum ?? '',
      beginn: s.zeit?.padStart(5, '0') ?? null,
      titel: s.titel,
      veranstaltungsort: s.location,
      kategorie: s.kategorie,
      bestaetigt: s.bestaetigt,
    });
    if (!v.ok) {
      for (const f of v.error) verworfen[f.code] = (verworfen[f.code] ?? 0) + 1;
      continue;
    }
    const t = v.value.termin;
    const ort = await client.query<{ id: string }>(
      `INSERT INTO ort (slug, name, landkreis) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [t.ortSlug, s.ort, t.landkreis],
    );
    const ortId = ort.rows[0]?.id;
    if (!ortId) throw new Error(`Ort ${t.ortSlug} konnte nicht angelegt werden`);
    const r = await client.query(
      `INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (ort_id, datum, titel) DO NOTHING`,
      [ortId, t.datum, t.beginn, t.titel, t.veranstaltungsort, t.kategorie, t.bestaetigt],
    );
    ok += r.rowCount ?? 0;
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
console.log(`✔ ${datei}: ${ok} Termine eingespielt, verworfen:`, verworfen);
