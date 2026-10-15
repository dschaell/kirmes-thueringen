/**
 * CLI für Bearbeitungslinks der Kirmesgesellschaften.
 *
 *   npm run link -- erstellen <orts-slug> "<Bezeichnung>"   → gibt den Link EINMALIG aus
 *   npm run link -- liste
 *   npm run link -- sperren <id>
 */
import { ladeKonfiguration } from '../../config.js';
import { erzeugeToken, hashToken } from './festplatz-repository.js';
import { erstellePool } from './pool.js';

const [befehl, ...arg] = process.argv.slice(2);
const k = ladeKonfiguration();
const basis = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 10_000,
});

try {
  if (befehl === 'erstellen' && arg[0] && arg[1]) {
    const token = erzeugeToken();
    const r = await pool.query<{ id: string; name: string }>(
      `INSERT INTO bearbeitungslink (ort_id, token_hash, bezeichnung)
       SELECT id, $2, $3 FROM ort WHERE slug = $1 RETURNING id::text, (SELECT name FROM ort WHERE slug = $1)`,
      [arg[0], hashToken(token), arg[1]],
    );
    const neu = r.rows[0];
    if (!neu) throw new Error(`Ort „${arg[0]}“ nicht gefunden (Slug wie in der URL /orte/<slug>)`);
    console.log(
      `✔ Link #${neu.id} für ${neu.name} (${arg[1]}) – nur jetzt sichtbar, bitte direkt weitergeben:\n`,
    );
    console.log(`  ${basis}/verwalten#k=${token}\n`);
  } else if (befehl === 'liste') {
    const r = await pool.query(
      `SELECT l.id, o.name AS ort, l.bezeichnung, to_char(l.erstellt_am, 'YYYY-MM-DD') AS erstellt,
              to_char(l.zuletzt_genutzt, 'YYYY-MM-DD HH24:MI') AS genutzt,
              to_char(l.gesperrt_am, 'YYYY-MM-DD') AS gesperrt
         FROM bearbeitungslink l JOIN ort o ON o.id = l.ort_id ORDER BY l.id`,
    );
    console.table(r.rows);
  } else if (befehl === 'sperren' && arg[0]) {
    const r = await pool.query(
      'UPDATE bearbeitungslink SET gesperrt_am = now() WHERE id = $1 AND gesperrt_am IS NULL',
      [arg[0]],
    );
    console.log(
      r.rowCount
        ? `✔ Link #${arg[0]} gesperrt`
        : `Link #${arg[0]} nicht gefunden oder schon gesperrt`,
    );
  } else {
    console.log(
      'Aufruf: link erstellen <orts-slug> "<Bezeichnung>" | link liste | link sperren <id>',
    );
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
