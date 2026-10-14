/** Composition Root: einziger Ort, an dem konkrete Adapter mit den Use Cases verdrahtet werden. */
import {
  FindeOrt,
  FindeTermin,
  ListeOrte,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
} from '@kirmes/core';
import { ladeKonfiguration } from './config.js';
import {
  PgBearbeitungslinks,
  PgFestplatzRepository,
} from './infrastructure/postgres/festplatz-repository.js';
import { PgOrtRepository } from './infrastructure/postgres/ort-repository.js';
import { PgTerminVerwaltung } from './infrastructure/postgres/termin-verwaltung.js';
import { erstellePool } from './infrastructure/postgres/pool.js';
import {
  datenbankErreichbar,
  PgTerminRepository,
} from './infrastructure/postgres/termin-repository.js';
import { SystemUhr } from './infrastructure/system-uhr.js';
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
const app = await baueApp({
  sucheTermine: new SucheTermine(termine, uhr),
  findeTermin: new FindeTermin(termine),
  listeOrte: new ListeOrte(orte, uhr),
  findeOrt: new FindeOrt(orte),
  verwalteFestplaetze: new VerwalteFestplaetze(links, new PgFestplatzRepository(pool)),
  verwalteTermine: new VerwalteTermine(links, new PgTerminVerwaltung(pool), termine, uhr),
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
