/**
 * Meldungen von Besuchern an die Redaktion („Termin melden“, „Link für den Festplatz anfordern“).
 * Die Nachricht geht immer an die feste Redaktionsadresse – nie an eine Adresse aus dem Formular –,
 * damit das Formular nicht zum Versand von Spam an Dritte missbraucht werden kann.
 */
import { parseDatum } from '../domain/datum.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface Nachricht {
  betreff: string;
  text: string;
  /** Antwortadresse (Reply-To) – die E-Mail der meldenden Person; fehlt bei Systemnachrichten */
  antwortAn?: string;
}
/** Versand an die Redaktion (Empfänger und Absender stehen in der Konfiguration des Adapters). */
export interface Postausgang {
  sende(n: Nachricht): Promise<void>;
}
/** Mitmach-Anfrage zum Speichern (Issue #279, Verwaltung in mitmach-anfragen.ts) */
export interface NeueAnfrage {
  name: string;
  email: string;
  ort: string | null;
  info: string | null;
}
/** Schutz vor Überflutung: ab so vielen offenen Anfragen wird nur noch gemailt */
export const ANFRAGEN_MAX_OFFEN = 200;
export interface AnfragenAblage {
  /** false = schon zu viele offene Anfragen */
  lege(a: NeueAnfrage, maxOffen: number): Promise<boolean>;
}
/** Zählt Meldungen je Schlüssel in einem Zeitfenster. */
export interface Drosselung {
  /** true und mitgezählt, solange das Limit nicht erreicht ist */
  erlaube(schluessel: string): boolean;
}

// ── Eingabe ─────────────────────────────────────────────────────────────────────────────
/**
 * termin = Terminmeldung, link = Festplatz-Link anfordern, mitmachen = Anfrage für die Redaktion,
 * beitrag = Beitrag mit Fotos melden (Issue #352; titel = Adresse des Beitrags, info = Grund)
 */
export type MeldungsArt = 'termin' | 'link' | 'mitmachen' | 'beitrag';
const BEITRAG_ADRESSE = /^\/orte\/[a-z0-9-]{1,120}#beitrag-[0-9a-f-]{36}$/;
export interface MeldungEingabe {
  art: MeldungsArt;
  ort: string;
  landkreis?: string;
  datum?: string;
  zeit?: string;
  titel?: string;
  veranstaltungsort?: string;
  info?: string;
  absender: string;
  email: string;
  /** Unsichtbares Feld – nur Bots füllen es aus */
  falle?: string;
  /** Millisekunden zwischen Laden und Absenden des Formulars */
  dauerMs?: number;
}

export const MELDUNG_MIN_DAUER_MS = 3000;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Einzeilig, ohne Steuerzeichen (verhindert Header-Injection im Betreff). */
const zeile = (s: string | undefined) =>
  (s ?? '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const mehrzeilig = (s: string | undefined) =>
  (s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' '))
    .trim();

function pruefe(e: MeldungEingabe): Validierungsfehler[] {
  const f: Validierungsfehler[] = [];
  const laenge = (feld: string, wert: string, max: number, pflicht: boolean, name: string) => {
    if (pflicht && !wert) f.push({ feld, code: 'PFLICHT', meldung: `${name} fehlt.` });
    else if (wert.length > max)
      f.push({ feld, code: 'LAENGE', meldung: `${name}: höchstens ${max} Zeichen.` });
  };
  laenge('ort', zeile(e.ort), 120, e.art !== 'mitmachen', 'Ort');
  laenge('landkreis', zeile(e.landkreis), 60, false, 'Landkreis');
  laenge('titel', zeile(e.titel), 200, e.art === 'termin', 'Veranstaltung');
  laenge('veranstaltungsort', zeile(e.veranstaltungsort), 120, false, 'Veranstaltungsort');
  laenge('info', mehrzeilig(e.info), 2000, false, 'Weitere Infos');
  laenge(
    'absender',
    zeile(e.absender),
    120,
    true,
    e.art === 'mitmachen' ? 'Name' : 'Name / Kirmesgesellschaft',
  );
  const email = zeile(e.email);
  if (!EMAIL.test(email) || email.length > 200) {
    f.push({
      feld: 'email',
      code: 'EMAIL',
      meldung: 'Bitte eine gültige E-Mail-Adresse angeben – für Rückfragen.',
    });
  }
  if (e.art === 'termin') {
    const d = parseDatum(zeile(e.datum));
    if (!d.ok) f.push(d.error);
  }
  if (e.art === 'beitrag') {
    if (!BEITRAG_ADRESSE.test(zeile(e.titel)))
      f.push({ feld: 'titel', code: 'BEITRAG', meldung: 'Unbekannter Beitrag.' });
    if (!mehrzeilig(e.info))
      f.push({ feld: 'info', code: 'PFLICHT', meldung: 'Bitte kurz schreiben, was nicht stimmt.' });
  }
  if (zeile(e.zeit) && !ZEIT.test(zeile(e.zeit))) {
    f.push({ feld: 'zeit', code: 'ZEIT', meldung: 'Uhrzeit bitte als HH:MM.' });
  }
  return f;
}

function nachricht(e: MeldungEingabe): Nachricht {
  const ort = zeile(e.ort);
  const zeilen = (paare: [string, string | undefined][]) =>
    paare
      .map(([k, v]) => [k, zeile(v)] as const)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  const absender = zeilen([
    ['Von', e.absender],
    ['E-Mail', e.email],
  ]);
  const info = mehrzeilig(e.info);
  if (e.art === 'mitmachen') {
    return {
      betreff: zeile(`Mitmachen in der Redaktion: ${e.absender}`).slice(0, 150),
      text: `Anfrage, in der Redaktion mitzumachen.\n\n${zeilen([['Region / Ort', e.ort]])}${
        info ? `\n\n${info}\n` : '\n'
      }\n${absender}\n\nAnnehmen oder ablehnen im Redaktionsbereich unter „Anfragen“ – beim Annehmen geht der Einladungslink automatisch an die angegebene Adresse.\n`,
      antwortAn: zeile(e.email),
    };
  }
  if (e.art === 'beitrag') {
    return {
      betreff: zeile(`Beitrag gemeldet: ${ort}`).slice(0, 150),
      text: `Ein Besucher hat einen Beitrag gemeldet.\n\nBeitrag: ${zeile(e.titel)}\n\nGrund:\n${info}\n\n${absender}\n\nBei Verstoß bitte im Redaktionsbereich unter „Beiträge“ löschen.\n`,
      antwortAn: zeile(e.email),
    };
  }
  if (e.art === 'link') {
    return {
      betreff: zeile(`Link für den Festplatz: ${ort}`).slice(0, 150),
      text: `Bitte um einen persönlichen Link für den Festplatz.\n\n${zeilen([
        ['Ort', e.ort],
        ['Landkreis', e.landkreis],
      ])}\n${info ? `\n${info}\n` : ''}\n${absender}\n`,
      antwortAn: zeile(e.email),
    };
  }
  return {
    betreff: zeile(`Terminmeldung: ${e.titel} in ${ort} am ${e.datum}`).slice(0, 150),
    text: `${zeilen([
      ['Ort', e.ort],
      ['Landkreis', e.landkreis],
      ['Datum', e.datum],
      ['Uhrzeit', e.zeit],
      ['Veranstaltung', e.titel],
      ['Veranstaltungsort', e.veranstaltungsort],
    ])}\n${info ? `\nWeitere Infos:\n${info}\n` : ''}\n${absender}\n\nBitte vor der Veröffentlichung prüfen.\n`,
    antwortAn: zeile(e.email),
  };
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export type MeldungFehler = Validierungsfehler[] | 'ZU_VIELE';

export class MeldeAnRedaktion {
  constructor(
    private readonly post: Postausgang,
    private readonly jeAbsender: Drosselung,
    private readonly gesamt: Drosselung,
    /** Mitmach-Anfragen zusätzlich speichern (Issue #279) */
    private readonly anfragen?: AnfragenAblage,
  ) {}

  /**
   * @param herkunft z. B. die IP-Adresse – Grundlage der Begrenzung je Absender
   * @returns `gesendet: false`, wenn die Meldung als Spam verworfen wurde (Bots erfahren das nicht)
   */
  async melde(
    e: MeldungEingabe,
    herkunft: string,
  ): Promise<Result<{ gesendet: boolean }, MeldungFehler>> {
    const fehler = pruefe(e);
    if (fehler.length > 0) return err(fehler);
    if (zeile(e.falle) || (e.dauerMs ?? 0) < MELDUNG_MIN_DAUER_MS) return ok({ gesendet: false });
    if (!this.jeAbsender.erlaube(herkunft) || !this.gesamt.erlaube('gesamt')) {
      return err('ZU_VIELE');
    }
    if (e.art === 'mitmachen' && this.anfragen) {
      await this.anfragen.lege(
        {
          name: zeile(e.absender),
          email: zeile(e.email),
          ort: zeile(e.ort) || null,
          info: mehrzeilig(e.info) || null,
        },
        ANFRAGEN_MAX_OFFEN,
      );
    }
    await this.post.sende(nachricht(e));
    return ok({ gesendet: true });
  }
}
