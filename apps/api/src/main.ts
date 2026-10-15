/** Composition Root: einziger Ort, an dem konkrete Adapter mit den Use Cases verdrahtet werden. */
import {
  FindeOrt,
  FindeTermin,
  ListeOrte,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
  AdminAnmeldung,
  Passkeys,
  Redaktion,
} from '@kirmes/core';
import { ladeKonfiguration } from './config.js';
import {
  PgBearbeitungslinks,
  PgFestplatzRepository,
} from './infrastructure/postgres/festplatz-repository.js';
import { NodeKryptografie, SpeicherAnmeldeversuche } from './infrastructure/krypto.js';
import {
  ortLandkreis,
  PgAdminKonten,
  PgLinkVerwaltung,
  PgMitteilungen,
  PgOrtVerwaltung,
  PgSitzungen,
} from './infrastructure/postgres/admin-repository.js';
import { PgOrtRepository } from './infrastructure/postgres/ort-repository.js';
import { PgTerminVerwaltung } from './infrastructure/postgres/termin-verwaltung.js';
import { erstellePool } from './infrastructure/postgres/pool.js';
import {
  datenbankErreichbar,
  PgTerminRepository,
} from './infrastructure/postgres/termin-repository.js';
import { SystemUhr } from './infrastructure/system-uhr.js';
import { PgPasskeys } from './infrastructure/postgres/passkey-repository.js';
import { SimpleWebAuthn, SpeicherChallenges } from './infrastructure/webauthn.js';
import { baueApp } from './interfaces/http/app.js';

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 10,
  statementTimeoutMs: 5_000,
});

const uhr = new SystemUhr();
const orte = new PgOrtRepository(pool);
const termine = new PgTerminRepository(pool);
const links = new PgBearbeitungslinks(pool);
const terminVerwaltung = new PgTerminVerwaltung(pool);
const mitteilungen = new PgMitteilungen(pool);
const krypto = new NodeKryptografie();
const konten = new PgAdminKonten(pool);
const sitzungen = new PgSitzungen(pool);
// Passkeys: eigene, großzügige Sperre – Fehlversuche ohne gültige Signatur sollen die
// Redaktion nicht aussperren (Passwort + Einmalcode bleibt ohnehin als Rückfallweg).
const passkeys = k.websiteUrl
  ? new Passkeys(
      new PgPasskeys(pool),
      new SimpleWebAuthn(k.websiteUrl),
      new SpeicherChallenges(),
      sitzungen,
      konten,
      krypto,
      new SpeicherAnmeldeversuche(100, 100),
    )
  : undefined;
const app = await baueApp({
  sucheTermine: new SucheTermine(termine, uhr),
  findeTermin: new FindeTermin(termine),
  listeOrte: new ListeOrte(orte, uhr),
  findeOrt: new FindeOrt(orte),
  verwalteFestplaetze: new VerwalteFestplaetze(links, new PgFestplatzRepository(pool)),
  verwalteTermine: new VerwalteTermine(links, terminVerwaltung, termine, uhr),
  aktuelleMitteilung: () => mitteilungen.aktuelle(),
  admin: {
    anmeldung: new AdminAnmeldung(konten, krypto, sitzungen, new SpeicherAnmeldeversuche()),
    passkeys,
    redaktion: new Redaktion(
      mitteilungen,
      new PgOrtVerwaltung(pool),
      ortLandkreis(pool),
      terminVerwaltung,
      new PgLinkVerwaltung(pool),
      krypto,
    ),
  },
  datenbankErreichbar: () => datenbankErreichbar(pool),
  logger: {
    level: k.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
});

pool.on('error', (e) => app.log.error({ err: e }, 'Fehler im DB-Pool'));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'Fahre herunter');
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: k.port, host: k.host });
