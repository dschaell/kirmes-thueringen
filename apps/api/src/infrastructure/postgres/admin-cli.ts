/**
 * CLI: Redaktionszugang (Admin) einrichten.
 *
 *   npm run admin -- anlegen <email>      → fragt Passwort ab, zeigt Einrichtung für die Authenticator-App
 *   npm run admin -- passwort <email>     → neues Passwort setzen
 *   npm run admin -- zweiter-faktor <email> → neues Geheimnis für die Authenticator-App (altes ungültig)
 *   npm run admin -- abmelden <email>     → alle Sitzungen beenden
 */
import { createInterface } from 'node:readline';
import { ladeKonfiguration } from '../../config.js';
import { hashePasswort, neuesTotpGeheimnis, otpauthUrl } from '../krypto.js';
import { erstellePool } from './pool.js';

/** Passwort ohne Echo einlesen. */
function frageVerdeckt(frage: string): Promise<string> {
  return new Promise((auf) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const original = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(frage)) original.call(rl, s);
      else if (s.includes('\n')) original.call(rl, '\n');
      else original.call(rl, '*');
    };
    rl.question(frage, (antwort) => {
      rl.close();
      auf(antwort);
    });
  });
}

async function neuesPasswort(): Promise<string> {
  const p1 = await frageVerdeckt('Passwort (mind. 12 Zeichen): ');
  if (p1.length < 12) throw new Error('Das Passwort muss mindestens 12 Zeichen lang sein.');
  const p2 = await frageVerdeckt('Passwort wiederholen: ');
  if (p1 !== p2) throw new Error('Die Passwörter stimmen nicht überein.');
  return hashePasswort(p1);
}

function zeigeZweitenFaktor(email: string, geheimnis: string) {
  console.log(
    '\nZweiter Faktor – in der Authenticator-App (Google Authenticator, Authy, 1Password …):',
  );
  console.log('  „Konto hinzufügen“ → „Schlüssel eingeben“');
  console.log(`  Konto:     ${email}`);
  console.log(`  Schlüssel: ${geheimnis.match(/.{4}/g)?.join(' ')}`);
  console.log(`  (oder als Link: ${otpauthUrl(email, geheimnis)})\n`);
}

const [befehl, emailRoh] = process.argv.slice(2);
const email = emailRoh?.trim().toLowerCase();
if (!befehl || !email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
  console.log('Aufruf: admin anlegen|passwort|zweiter-faktor|abmelden <email>');
  process.exit(1);
}

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 10_000,
});
try {
  if (befehl === 'anlegen') {
    const hash = await neuesPasswort();
    const geheimnis = neuesTotpGeheimnis();
    const r = await pool.query(
      'INSERT INTO admin (email, passwort_hash, totp_geheimnis) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      [email, hash, geheimnis],
    );
    if (!r.rowCount) throw new Error(`Für ${email} gibt es schon ein Konto.`);
    console.log(`✔ Admin ${email} angelegt.`);
    zeigeZweitenFaktor(email, geheimnis);
  } else if (befehl === 'passwort') {
    const r = await pool.query('UPDATE admin SET passwort_hash = $2 WHERE email = $1', [
      email,
      await neuesPasswort(),
    ]);
    await pool.query(
      'DELETE FROM admin_sitzung WHERE admin_id IN (SELECT id FROM admin WHERE email = $1)',
      [email],
    );
    console.log(
      r.rowCount ? '✔ Passwort geändert, alle Sitzungen beendet.' : 'Konto nicht gefunden.',
    );
  } else if (befehl === 'zweiter-faktor') {
    const geheimnis = neuesTotpGeheimnis();
    const r = await pool.query('UPDATE admin SET totp_geheimnis = $2 WHERE email = $1', [
      email,
      geheimnis,
    ]);
    if (!r.rowCount) throw new Error('Konto nicht gefunden.');
    console.log('✔ Neuer zweiter Faktor – der alte Eintrag in der App ist ab sofort ungültig.');
    zeigeZweitenFaktor(email, geheimnis);
  } else if (befehl === 'abmelden') {
    const r = await pool.query(
      'DELETE FROM admin_sitzung WHERE admin_id IN (SELECT id FROM admin WHERE email = $1)',
      [email],
    );
    console.log(`✔ ${r.rowCount} Sitzung(en) beendet.`);
  } else {
    console.log('Unbekannter Befehl.');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
