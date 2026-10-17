import { Vorschlaege } from '@kirmes/core';
import { terminHerkunft } from './infrastructure/postgres/termin-herkunft.js';
import { PgVorschlaege } from './infrastructure/postgres/vorschlags-repository.js';
/** Composition Root: einziger Ort, an dem konkrete Adapter mit den Use Cases verdrahtet werden. */
import {
  FindeOrt,
  FindeTermin,
  ListeOrte,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
  AdminAnmeldung,
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  Registrierung,
  MeldeAnRedaktion,
  Passkeys,
  Redaktion,
  RedaktionsTermine,
  RedaktionsFestplaetze,
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
  PgEinladungen,
  PgErsterAdmin,
  PgKontoAnlage,
  PgMitglieder,
  PgLinkVerwaltung,
  PgMitteilungen,
  PgOrtVerwaltung,
  PgSitzungen,
} from './infrastructure/postgres/admin-repository.js';
import { PgOrtRepository } from './infrastructure/postgres/ort-repository.js';
import {
  PgTerminVerwaltung,
  terminVorschlaege,
} from './infrastructure/postgres/termin-verwaltung.js';
import { erstellePool } from './infrastructure/postgres/pool.js';
import {
  datenbankErreichbar,
  PgTerminRepository,
} from './infrastructure/postgres/termin-repository.js';
import { SystemUhr } from './infrastructure/system-uhr.js';
import { PgPasskeys } from './infrastructure/postgres/passkey-repository.js';
import { SimpleWebAuthn, SpeicherChallenges } from './infrastructure/webauthn.js';
import { SmtpPostausgang, SpeicherDrosselung, smtpTransport } from './infrastructure/post.js';
import { SpeicherEinrichtungslinks } from './infrastructure/einrichtungslinks.js';
import { GoogleKartenlinks } from './infrastructure/kartenlinks.js';
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
// Anmeldung nur mit Passkey (Issue #56) – braucht WEBSITE_URL als Relying Party.
// Eigene, großzügige Sperre: Fehlversuche ohne gültige Signatur sollen niemanden aussperren.
const webauthn = k.websiteUrl ? new SimpleWebAuthn(k.websiteUrl) : undefined;
// Getrennte Speicher: Wer die Anmeldung mit Anfragen flutet, verdrängt keine Registrierungen
const challenges = new SpeicherChallenges(5 * 60_000, 2000);
const registrierungsChallenges = new SpeicherChallenges(10 * 60_000, 500);
const passkeys = webauthn
  ? new Passkeys(
      new PgPasskeys(pool),
      webauthn,
      challenges,
      sitzungen,
      konten,
      krypto,
      new SpeicherAnmeldeversuche(100, 100),
    )
  : undefined;
const einladungen = new PgEinladungen(pool);
const registrierung = webauthn
  ? new Registrierung(
      webauthn,
      registrierungsChallenges,
      new PgKontoAnlage(pool),
      sitzungen,
      krypto,
    )
  : undefined;
// Erster Admin im Browser: Link nur ans Redaktionspostfach, höchstens 3 pro Stunde
const postausgang = k.smtp ? new SmtpPostausgang(k.smtp, smtpTransport(k.smtp)) : undefined;
const einrichtung =
  postausgang && registrierung && k.websiteUrl
    ? new Ersteinrichtung(
        new PgErsterAdmin(pool),
        new SpeicherEinrichtungslinks(),
        postausgang,
        new SpeicherDrosselung(3, 3_600_000),
        registrierung,
        k.websiteUrl,
      )
    : undefined;
const vorschlagsRepo = new PgVorschlaege(pool);
await vorschlagsRepo.raeumeAuf();
const aufraeumen = setInterval(() => {
  void vorschlagsRepo
    .raeumeAuf()
    .catch(() => app.log.error('Vorschläge konnten nicht aufgeräumt werden'));
}, 24 * 3600_000);
aufraeumen.unref();
const app = await baueApp({
  terminVorschlaege:
    postausgang && k.websiteUrl
      ? new Vorschlaege(
          vorschlagsRepo,
          orte,
          sitzungen,
          postausgang,
          new SpeicherDrosselung(5, 3_600_000),
          new SpeicherDrosselung(100, 3_600_000),
          k.websiteUrl,
        )
      : undefined,
  sucheTermine: new SucheTermine(termine, uhr),
  findeTermin: new FindeTermin(termine),
  listeOrte: new ListeOrte(orte, uhr),
  findeOrt: new FindeOrt(orte),
  verwalteFestplaetze: new VerwalteFestplaetze(links, new PgFestplatzRepository(pool)),
  verwalteTermine: new VerwalteTermine(links, terminVerwaltung, termine, uhr),
  aktuelleMitteilung: () => mitteilungen.aktuelle(),
  // Meldungen: je Besucher 5 pro Stunde, insgesamt 100 pro Stunde
  meldungen: postausgang
    ? new MeldeAnRedaktion(
        postausgang,
        new SpeicherDrosselung(5, 3_600_000),
        new SpeicherDrosselung(100, 3_600_000),
      )
    : undefined,
  admin: {
    terminFinden: (id) => termine.finde(id),
    terminHerkunft: (ids) => terminHerkunft(pool, ids),
    terminListe: new RedaktionsTermine(termine, sitzungen, uhr),
    anmeldung: new AdminAnmeldung(sitzungen),
    passkeys,
    einrichtung,
    beitritt: registrierung ? new Beitritt(einladungen, registrierung) : undefined,
    mitglieder: new Mitgliederverwaltung(new PgMitglieder(pool), einladungen, krypto),
    vorschlaege: () => terminVorschlaege(pool),
    festplaetze: new RedaktionsFestplaetze(
      new PgFestplatzRepository(pool),
      ortLandkreis(pool),
      new GoogleKartenlinks(),
    ),
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
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-kirmes-client-ip"]',
    ],
  },
});

pool.on('error', (e) => app.log.error({ err: e }, 'Fehler im DB-Pool'));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'Fahre herunter');
    clearInterval(aufraeumen);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: k.port, host: k.host });
