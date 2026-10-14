/**
 * CLI: spielt Beispieltermine (db/seed/termine.beispiel.json) für Entwicklung und CI ein.
 * Die Daten sind erfunden („Beispieltermin: …“) und liegen relativ zu heute, damit es immer
 * kommende Termine gibt. Nicht auf dem Produktionsserver verwenden.
 */
import { validiereTermin } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import { ladeKonfiguration } from '../../config.js';
import { SystemUhr } from '../system-uhr.js';
import { erstellePool } from './pool.js';

interface Beispiel {
  ort: string;
  inTagen: number;
  zeit: string | null;
  location: string | null;
  titel: string;
  kategorie: string;
  bestaetigt: boolean;
}

const daten = JSON.parse(
  await readFile(new URL('../../../../../db/seed/termine.beispiel.json', import.meta.url), 'utf8'),
) as Beispiel[];
const heute = new SystemUhr().heute();
const tag = (n: number) => new Date(Date.parse(heute) + n * 86_400_000).toISOString().slice(0, 10);

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 30_000,
});
let n = 0;
try {
  for (const b of daten) {
    const ort = await pool.query<{ id: string; landkreis: string }>(
      'SELECT id, landkreis FROM ort WHERE slug = $1',
      [b.ort],
    );
    const o = ort.rows[0];
    if (!o) throw new Error(`Ort ${b.ort} fehlt – zuerst „npm run db:orte“ ausführen`);
    const v = validiereTermin({
      ortSlug: b.ort,
      landkreis: o.landkreis,
      datum: tag(b.inTagen),
      beginn: b.zeit,
      titel: b.titel,
      veranstaltungsort: b.location,
      kategorie: b.kategorie,
      bestaetigt: b.bestaetigt,
    });
    if (!v.ok) throw new Error(`${b.titel}: ${v.error.map((f) => f.meldung).join(' ')}`);
    const t = v.value.termin;
    const r = await pool.query(
      `INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, quelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Beispieldaten') ON CONFLICT (ort_id, datum, titel) DO NOTHING`,
      [o.id, t.datum, t.beginn, t.titel, t.veranstaltungsort, t.kategorie, t.bestaetigt],
    );
    n += r.rowCount ?? 0;
  }
  console.log(`✔ ${n} Beispieltermine eingespielt`);
} finally {
  await pool.end();
}
