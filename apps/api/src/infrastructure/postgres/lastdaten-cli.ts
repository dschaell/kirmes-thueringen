/**
 * CLI: Lastdaten erzeugen – nur in *_test- oder *_perf-Datenbanken.
 *   DATABASE_URL=…/kirmes_perf npm run lastdaten -w @kirmes/api -- 10000 900
 */
import { erzeugeLastdaten, istLastdatenbank } from './lastdaten.js';
import { erstellePool } from './pool.js';

const url = process.env.DATABASE_URL ?? '';
if (!istLastdatenbank(url)) {
  console.error('Abgebrochen: Lastdaten nur in einer Datenbank *_test oder *_perf.');
  process.exit(2);
}
const pool = erstellePool({
  connectionString: url,
  ssl: false,
  maxVerbindungen: 2,
  statementTimeoutMs: 60_000,
});
const [termine, orte] = process.argv.slice(2).map(Number);
const e = await erzeugeLastdaten(pool, { termine: termine || 10_000, orte: orte || 900 });
process.stdout.write(`✔ ${e.orte} Orte und ${e.termine} Termine angelegt\n`);
await pool.end();
