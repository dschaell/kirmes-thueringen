/**
 * Push-Benachrichtigungen (Issue #348): Wer einem Ort folgt oder Termine merkt, bekommt eine
 * Nachricht, wenn ein Termin neu ist, sich Datum, Uhrzeit, Ort oder Titel ändern oder er abgesagt
 * wird – und am Vortag eine Erinnerung. Gespeichert wird je Gerät nur der Push-Endpunkt mit seinen
 * Schlüsseln und was gefolgt bzw. gemerkt ist; keine Namen, keine Mail-Adressen.
 */
import { err, ok, type Result } from '../domain/result.js';
import type { NeuerTermin, Termin } from '../domain/termin.js';
import { istOrtSlug } from '../domain/termin.js';
import type { Beitrag } from './beitraege.js';
import type { Berechtigung } from './festplaetze.js';
import type { TerminRepository } from './ports.js';
import type { TerminVerwaltung } from './termine-verwalten.js';

export const PUSH_MAX_ORTE = 50;
export const PUSH_MAX_TERMINE = 100;
/** Geräte, die sich so lange nicht gemeldet haben, werden gelöscht */
export const PUSH_AUFBEWAHRUNG_TAGE = 400;

/**
 * Nur die Push-Dienste der Browser – der Server schickt an diese Adresse, also darf niemand eine
 * eigene eintragen (Schutz vor SSRF, OWASP A10).
 */
const PUSH_DIENSTE = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushZiel {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushAbo extends PushZiel {
  orte: string[];
  termine: string[];
  erinnerung: boolean;
}
export interface PushNachricht {
  titel: string;
  text: string;
  /** Pfad auf der eigenen Seite, der beim Antippen öffnet */
  url: string;
  /** gleiche Kennung ersetzt eine ältere Nachricht auf dem Gerät */
  tag: string;
}
/** Kurzform eines Termins für Nachrichten */
export interface PushTermin {
  id: string;
  titel: string;
  datum: string;
  beginn: string | null;
  ortSlug: string;
  ortName: string;
  veranstaltungsort: string | null;
}

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface PushAblage {
  /** Anlegen oder ersetzen (je Endpunkt); unbekannte Orte werden übergangen */
  speichere(abo: PushAbo): Promise<void>;
  loesche(endpoint: string): Promise<boolean>;
  /** Geräte, die dem Ort folgen oder einen der Termine gemerkt haben – jedes nur einmal */
  empfaenger(ortSlug: string, terminIds: readonly string[]): Promise<PushZiel[]>;
  /**
   * Geräte mit Erinnerung, die für `datum` noch nicht erinnert wurden, samt ihren Terminen an
   * diesem Tag (gemerkt oder an gefolgten Orten). Markiert sie als erinnert.
   */
  erinnerungen(datum: string): Promise<{ ziel: PushZiel; termine: PushTermin[] }[]>;
  raeumeAuf(tage: number): Promise<void>;
}
export type Zustellung = 'zugestellt' | 'abgemeldet' | 'fehler';
export interface PushVersand {
  sende(ziel: PushZiel, n: PushNachricht): Promise<Zustellung>;
}

export type PushFehler = 'ENDPUNKT' | 'SCHLUESSEL' | 'LISTE';

const WOCHENTAGE = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
/** „Sa., 7.11.“ – aus dem Kalenderdatum, ohne Zeitzone */
export const datumKurzText = (d: string) => {
  const [j, m, t] = d.split('-').map(Number) as [number, number, number];
  const tag = new Date(Date.UTC(j, m - 1, t)).getUTCDay();
  return `${WOCHENTAGE[tag]}, ${t}.${m}.`;
};
const uhr = (b: string | null) => (b ? ` um ${b} Uhr` : '');
const wo = (t: PushTermin) =>
  `${t.ortName}${t.veranstaltungsort ? ` (${t.veranstaltungsort})` : ''}`;

/** Text der Nachrichten – eigene Funktionen, damit die Formulierung an einer Stelle steht */
export const pushText = {
  neu: (t: PushTermin): PushNachricht => ({
    titel: `Neu: ${t.titel} in ${t.ortName}`,
    text: `${datumKurzText(t.datum)}${uhr(t.beginn)} – ${wo(t)}`,
    url: `/termin/${t.id}`,
    tag: `termin-${t.id}`,
  }),
  mehrereNeu: (ts: PushTermin[]): PushNachricht => ({
    titel: `${ts.length} neue Termine in ${ts[0]?.ortName ?? ''}`,
    text: ts
      .slice(0, 4)
      .map((t) => `${datumKurzText(t.datum)} ${t.titel}`)
      .join(' · '),
    url: `/orte/${ts[0]?.ortSlug ?? ''}`,
    tag: `ort-${ts[0]?.ortSlug ?? ''}`,
  }),
  geaendert: (t: PushTermin): PushNachricht => ({
    titel: `Geändert: ${t.titel} in ${t.ortName}`,
    text: `Jetzt ${datumKurzText(t.datum)}${uhr(t.beginn)} – ${wo(t)}`,
    url: `/termin/${t.id}`,
    tag: `termin-${t.id}`,
  }),
  abgesagt: (t: PushTermin): PushNachricht => ({
    titel: `Abgesagt: ${t.titel} in ${t.ortName}`,
    text: `${datumKurzText(t.datum)}${uhr(t.beginn)} findet nicht statt.`,
    url: `/orte/${t.ortSlug}`,
    tag: `termin-${t.id}`,
  }),
  /** Neuer Beitrag mit Fotos (Issue #352) */
  beitrag: (b: Beitrag): PushNachricht => {
    const text = b.text.replace(/\s+/g, ' ');
    return {
      titel: `Neu aus ${b.ortName}${b.kgName ? ` – ${b.kgName}` : ''}`,
      text: text
        ? text.length > 120
          ? `${text.slice(0, 119)}…`
          : text
        : b.fotos.length === 1
          ? 'Ein neues Foto'
          : `${b.fotos.length} neue Fotos`,
      url: `/orte/${b.ortSlug}#beitrag-${b.id}`,
      tag: `beitrag-${b.id}`,
    };
  },
  erinnerung: (ts: PushTermin[]): PushNachricht =>
    ts.length === 1 && ts[0]
      ? {
          titel: `Morgen: ${ts[0].titel} in ${ts[0].ortName}`,
          text: `${ts[0].beginn ? `Ab ${ts[0].beginn} Uhr – ` : ''}${wo(ts[0])}`,
          url: `/termin/${ts[0].id}`,
          tag: `erinnerung-${ts[0].datum}`,
        }
      : {
          titel: `Morgen ${ts.length}× Kirmes`,
          text: ts
            .slice(0, 4)
            .map((t) => `${t.beginn ?? ''} ${t.titel} (${t.ortName})`.trim())
            .join(' · '),
          url: '/gemerkt',
          tag: `erinnerung-${ts[0]?.datum ?? ''}`,
        },
};

function pruefe(abo: PushAbo): PushFehler | null {
  let host = '';
  const m = /^https:\/\/([^/?#:]+)(?::443)?\//.exec(abo.endpoint);
  if (m?.[1]) host = m[1].toLowerCase();
  if (abo.endpoint.length > 1000 || !PUSH_DIENSTE.some((d) => d.test(host))) return 'ENDPUNKT';
  if (
    !BASE64URL.test(abo.p256dh) ||
    !BASE64URL.test(abo.auth) ||
    abo.p256dh.length > 200 ||
    abo.auth.length > 100
  )
    return 'SCHLUESSEL';
  if (
    abo.orte.length > PUSH_MAX_ORTE ||
    abo.termine.length > PUSH_MAX_TERMINE ||
    !abo.orte.every(istOrtSlug) ||
    !abo.termine.every((t) => UUID.test(t))
  )
    return 'LISTE';
  return null;
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export class Benachrichtigungen {
  constructor(
    private readonly ablage: PushAblage,
    private readonly versand: PushVersand,
  ) {}

  async abonniere(abo: PushAbo): Promise<Result<true, PushFehler>> {
    const eingabe = {
      ...abo,
      orte: [...new Set(abo.orte)],
      termine: [...new Set(abo.termine.map((t) => t.toLowerCase()))],
    };
    const f = pruefe(eingabe);
    if (f) return err(f);
    await this.ablage.speichere(eingabe);
    return ok(true);
  }

  abmelden(endpoint: string): Promise<boolean> {
    return this.ablage.loesche(endpoint);
  }

  /** An alle Ziele schicken; abgemeldete Geräte (404/410) fliegen raus. */
  private async verteile(ziele: PushZiel[], n: PushNachricht): Promise<number> {
    let zugestellt = 0;
    for (const z of ziele) {
      const r = await this.versand.sende(z, n);
      if (r === 'abgemeldet') await this.ablage.loesche(z.endpoint);
      if (r === 'zugestellt') zugestellt++;
    }
    return zugestellt;
  }

  async neu(termine: PushTermin[]): Promise<number> {
    const proOrt = new Map<string, PushTermin[]>();
    for (const t of termine) proOrt.set(t.ortSlug, [...(proOrt.get(t.ortSlug) ?? []), t]);
    let n = 0;
    for (const [ort, ts] of proOrt) {
      const ziele = await this.ablage.empfaenger(ort, []);
      n += await this.verteile(
        ziele,
        ts.length === 1 && ts[0] ? pushText.neu(ts[0]) : pushText.mehrereNeu(ts),
      );
    }
    return n;
  }

  async geaendert(t: PushTermin): Promise<number> {
    return this.verteile(await this.ablage.empfaenger(t.ortSlug, [t.id]), pushText.geaendert(t));
  }

  /** Empfänger vor dem Löschen lesen – danach gibt es die Merkliste zum Termin nicht mehr */
  empfaengerFuer(ortSlug: string, terminIds: readonly string[]): Promise<PushZiel[]> {
    return this.ablage.empfaenger(ortSlug, terminIds);
  }

  abgesagt(ziele: PushZiel[], t: PushTermin): Promise<number> {
    return this.verteile(ziele, pushText.abgesagt(t));
  }

  /** Neuer Beitrag (Issue #352): an alle, die dem Ort folgen */
  async beitrag(b: Beitrag): Promise<number> {
    return this.verteile(await this.ablage.empfaenger(b.ortSlug, []), pushText.beitrag(b));
  }

  /** Erinnerung für die Termine von `morgen`; jedes Gerät höchstens einmal je Tag. */
  async erinnere(morgen: string): Promise<number> {
    let n = 0;
    for (const { ziel, termine } of await this.ablage.erinnerungen(morgen)) {
      if (termine.length) n += await this.verteile([ziel], pushText.erinnerung(termine));
    }
    return n;
  }

  raeumeAuf(): Promise<void> {
    return this.ablage.raeumeAuf(PUSH_AUFBEWAHRUNG_TAGE);
  }
}

// ── Auslöser an der Terminverwaltung ────────────────────────────────────────────────────
const kurz = (t: Termin): PushTermin => ({
  id: t.id,
  titel: t.titel,
  datum: t.datum,
  beginn: t.beginn,
  ortSlug: t.ort.slug,
  ortName: t.ort.name,
  veranstaltungsort: t.veranstaltungsort,
});
/** Nur was Besucher wirklich betrifft – Tippfehler in Hinweisen lösen keine Nachricht aus */
const wichtig = (alt: Termin, neu: NeuerTermin) =>
  alt.datum !== neu.datum ||
  alt.beginn !== neu.beginn ||
  alt.titel !== neu.titel ||
  alt.veranstaltungsort !== neu.veranstaltungsort;

/**
 * Legt sich um die Terminverwaltung und meldet nach erfolgreichem Schreiben – ohne die Antwort an
 * den Nutzer aufzuhalten. Vergangene Termine lösen nichts aus.
 */
export class TerminVerwaltungMitPush implements TerminVerwaltung {
  private offen: Promise<unknown>[] = [];
  constructor(
    private readonly innen: TerminVerwaltung,
    private readonly termine: Pick<TerminRepository, 'finde'>,
    private readonly push: Benachrichtigungen,
    private readonly heute: () => string,
  ) {}

  /** Für Tests und geordnetes Herunterfahren: auf ausstehende Nachrichten warten */
  async fertig(): Promise<void> {
    const o = this.offen;
    this.offen = [];
    await Promise.allSettled(o);
  }
  private melde(f: () => Promise<unknown>) {
    this.offen.push(f().catch(() => undefined));
  }
  private kommend = (t: { datum: string }) => t.datum >= this.heute();

  async lege(t: NeuerTermin, durch: Berechtigung) {
    const r = await this.innen.lege(t, durch);
    if (this.kommend(r)) this.melde(() => this.push.neu([kurz(r)]));
    return r;
  }
  async legeAlle(t: NeuerTermin[], durch: Berechtigung) {
    const r = await this.innen.legeAlle(t, durch);
    const neu = r.filter(this.kommend).map(kurz);
    if (neu.length) this.melde(() => this.push.neu(neu));
    return r;
  }
  async aendere(id: string, t: NeuerTermin, durch: Berechtigung) {
    const alt = await this.termine.finde(id);
    const r = await this.innen.aendere(id, t, durch);
    if (r && alt && wichtig(alt, t) && this.kommend(t))
      this.melde(async () => {
        const jetzt = await this.termine.finde(id);
        if (jetzt) await this.push.geaendert(kurz(jetzt));
      });
    return r;
  }
  async aendereAlle(
    aenderungen: { id: string; termin: NeuerTermin }[],
    loeschen: string[],
    durch: Berechtigung,
    versionen?: Record<string, string>,
  ) {
    const alt = new Map<string, Termin>();
    for (const id of [...aenderungen.map((a) => a.id), ...loeschen]) {
      const t = await this.termine.finde(id);
      if (t) alt.set(id, t);
    }
    const abgesagt: { t: Termin; ziele: PushZiel[] }[] = [];
    for (const id of loeschen) {
      const a = alt.get(id);
      if (a && this.kommend(a))
        abgesagt.push({ t: a, ziele: await this.push.empfaengerFuer(a.ort.slug, [a.id]) });
    }
    const r = await this.innen.aendereAlle(aenderungen, loeschen, durch, versionen);
    if (r)
      this.melde(async () => {
        for (const { t, ziele } of abgesagt) await this.push.abgesagt(ziele, kurz(t));
        for (const { id, termin } of aenderungen) {
          const a = alt.get(id);
          const jetzt =
            a && wichtig(a, termin) && this.kommend(termin) ? await this.termine.finde(id) : null;
          if (jetzt) await this.push.geaendert(kurz(jetzt));
        }
      });
    return r;
  }
  setzeSpeisen(...a: Parameters<TerminVerwaltung['setzeSpeisen']>) {
    return this.innen.setzeSpeisen(...a);
  }
  bestaetige(...a: Parameters<TerminVerwaltung['bestaetige']>) {
    return this.innen.bestaetige(...a);
  }
  async loesche(id: string, durch: Berechtigung, version?: string) {
    // Vor dem Löschen lesen: danach gibt es weder Termin noch Merkliste dazu
    const alt = await this.termine.finde(id);
    const ziele =
      alt && this.kommend(alt) ? await this.push.empfaengerFuer(alt.ort.slug, [alt.id]) : null;
    const r = await this.innen.loesche(id, durch, version);
    if (r && alt && ziele) this.melde(() => this.push.abgesagt(ziele, kurz(alt)));
    return r;
  }
}
