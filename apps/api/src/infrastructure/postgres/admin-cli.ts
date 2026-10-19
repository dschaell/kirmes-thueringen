/**
 * CLI: Redaktion verwalten, wenn man Zugriff auf die Datenbank hat (lokal oder im Notfall).
 *
 *   npm run admin -- einladen admin|redaktion   → Einladungslink (einmalig, 7 Tage) ausgeben
 *   npm run admin -- abmelden-alle              → alle Sitzungen beenden
 *
 * Angemeldet wird nur mit Passkey (Issue #56). Auf dem Server legt man den ersten Admin im Browser
 * an (/admin/einrichten); weitere Mitglieder lädt ein Admin unter /admin/mitglieder ein.
 */
import { EINLADUNG_TAGE, ROLLEN, type Rolle } from '@kirmes/core';
import { ladeKonfiguration } from '../../config.js';
import { NodeKryptografie } from '../krypto.js';
import { PgEinladungen } from './admin-repository.js';
import { erstellePool } from './pool.js';

const [befehl, rolle] = process.argv.slice(2);
const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 10_000,
});
const token = new NodeKryptografie().neuesToken();
try {
  // Kirmesgesellschaften brauchen einen Ort – die lädt ein Admin in der Redaktion ein (Issue #180)
  const e =
    befehl === 'einladen' && ROLLEN.includes(rolle as Rolle) && rolle !== 'kirmesgesellschaft'
      ? await new PgEinladungen(pool).lege(token, rolle as Rolle, null, EINLADUNG_TAGE)
      : null;
  if (e) {
    const basis = (k.websiteUrl ?? 'http://localhost:4321').replace(/\/+$/, '');
    console.log(`✔ Einladung (${e.rolle}) gültig bis ${e.laeuftAb}:`);
    console.log(`  ${basis}/admin/einladung?t=${token}`);
  } else if (befehl === 'abmelden-alle') {
    const r = await pool.query('DELETE FROM admin_sitzung');
    console.log(`✔ ${r.rowCount} Sitzung(en) beendet.`);
  } else {
    console.log('Aufruf: admin einladen admin|redaktion  |  admin abmelden-alle');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
