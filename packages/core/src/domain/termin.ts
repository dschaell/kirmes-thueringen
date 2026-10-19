import { monatVon, parseDatum, type KalenderDatum } from './datum.js';
import type { Koordinate } from './festplatz.js';
import { parseLandkreis, type LandkreisKuerzel } from './landkreis.js';
import { err, ok, type Result, type Validierungsfehler } from './result.js';
import type { Speise } from './speisen.js';
import { bereinigeTitel, istKeinTermin } from './text.js';

/**
 * Klare Arten (Issues #64, #135, #147, #154): Tanz & Party, Familien & Kinder, Gottesdienst
 * (`tradition`, auch Kirmesbaum/Umzug), Frühschoppen, Ständchen und Sonstiges für alles, was nicht
 * passt (z. B. Seniorennachmittag).
 */
export const KATEGORIEN = [
  'party',
  'familie',
  'tradition',
  'fruehschoppen',
  'staendchen',
  'sonstiges',
] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

/** Frühere Bezeichnungen (Importe, alte Links) → neue Art. */
const FRUEHERE_KATEGORIEN: Record<string, Kategorie> = {
  kirmes: 'party',
  tanz: 'party',
  mai: 'party',
  kinder: 'familie',
  brauchtum: 'tradition',
  ostern: 'tradition',
};

/**
 * Findet in der Kirche statt (Issue #157): Gottesdienst, Andacht, Messe, Kirchgang – oder als Ort ist
 * eine Kirche angegeben. Die Route führt dann nie zum Festplatz. Gleiche Regel im SQL der API.
 */
export function istKirchlich(t: {
  kategorie: string;
  titel: string;
  veranstaltungsort?: string | null;
}): boolean {
  return (
    (t.kategorie === 'tradition' && /gottesdienst|andacht|messe\b|kirchgang/i.test(t.titel)) ||
    /kirche/i.test(t.veranstaltungsort ?? '')
  );
}

/** Neue Art aus neuer oder früherer Bezeichnung; null, wenn unbekannt. */
export function kategorieAus(k: string): Kategorie | null {
  const s = k.trim().toLowerCase();
  return (KATEGORIEN as readonly string[]).includes(s)
    ? (s as Kategorie)
    : (FRUEHERE_KATEGORIEN[s] ?? null);
}

export interface Ort {
  readonly slug: string;
  readonly name: string;
  readonly landkreis: LandkreisKuerzel;
  /** Ortsmitte (WGS84), null solange nicht geokodiert */
  readonly koordinate: Koordinate | null;
}

export interface Termin {
  /** Nur in geschützten Bearbeitungsantworten ausliefern. */
  readonly version?: string;
  /** Letzte Änderung (UTC, ISO) – für Kalender-Abos (Issue #139) */
  readonly geaendertAm?: string;
  readonly id: string;
  readonly ort: Ort;
  readonly datum: KalenderDatum;
  readonly beginn: string | null; // HH:MM
  readonly titel: string;
  readonly veranstaltungsort: string | null;
  readonly kategorie: Kategorie;
  /** true = vom Veranstalter (Kirmesgesellschaft) bestätigt; false = aus öffentlicher Ankündigung recherchiert */
  readonly bestaetigt: boolean;
  /** Von der Kirmesgesellschaft hinterlegter Festplatz (passend zum Veranstaltungsort oder Standard) */
  readonly festplatz: Koordinate | null;
  /** Band oder DJ – eigenes Feld, damit man nach Bands suchen kann; beim Gottesdienst Chor/Musik */
  readonly band: string | null;
  /** Pfarrer/in beim Gottesdienst (Issue #175) */
  readonly pfarrer?: string | null;
  /** Öffentliche Hinweise: Eintritt, Einlass, Shuttle … */
  readonly info: string | null;
  /** Minderjährige brauchen eine Erziehungsbeauftragung („Muttizettel“, § 1 Abs. 1 Nr. 4 JuSchG) */
  readonly muttizettel: boolean;
  /** Mittagstisch (nur bei der Einzelansicht geladen) */
  readonly speisen?: readonly Speise[];
}

export interface TerminEingabe {
  ortSlug: string;
  landkreis: string;
  datum: string;
  beginn?: string | null;
  titel: string;
  veranstaltungsort?: string | null;
  kategorie: string;
  bestaetigt?: boolean;
  band?: string | null;
  pfarrer?: string | null;
  info?: string | null;
  muttizettel?: boolean;
}

/** Validierte Eingabe, bereit zum Speichern. */
export interface NeuerTermin {
  readonly version?: string;
  readonly speisen?: readonly Speise[];
  readonly ortSlug: string;
  readonly landkreis: LandkreisKuerzel;
  readonly datum: KalenderDatum;
  readonly beginn: string | null;
  readonly titel: string;
  readonly veranstaltungsort: string | null;
  readonly kategorie: Kategorie;
  readonly bestaetigt: boolean;
  readonly band: string | null;
  readonly pfarrer?: string | null;
  readonly info: string | null;
  readonly muttizettel: boolean;
}

export interface Hinweis {
  code: string;
  meldung: string;
}

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITEL_MAX = 200;
const BAND_MAX = 120;
const INFO_MAX = 500;

/** Anführungszeichen um den Bandnamen sind überflüssig (Apostrophe wie in „Sethi's“ bleiben). */
const bereinigeBand = (b: string | null | undefined) =>
  b
    ?.replace(/["„“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;

/** Herbst = traditionelle Kirmeszeit in Thüringen (Kirchweih nach der Ernte). */
export const HERBST_MONATE = [9, 10, 11] as const;
export const istHerbstKirmes = (d: KalenderDatum): boolean =>
  (HERBST_MONATE as readonly number[]).includes(monatVon(d));

export const istOrtSlug = (s: string): boolean => SLUG.test(s);

/**
 * Validiert einen neuen Termin. Harte Regeln → Fehler, fachliche Auffälligkeiten → Hinweise
 * (eine Kirmes außerhalb des Herbstes ist ungewöhnlich, aber erlaubt: Maikirmes, Osterkirmes).
 */
export function validiereTermin(
  e: TerminEingabe,
): Result<{ termin: NeuerTermin; hinweise: Hinweis[] }, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];

  const datum = parseDatum(e.datum);
  if (!datum.ok) fehler.push(datum.error);

  const landkreis = parseLandkreis(e.landkreis);
  if (!landkreis.ok) fehler.push(landkreis.error);

  if (!istOrtSlug(e.ortSlug)) {
    fehler.push({ feld: 'ortSlug', code: 'SLUG_UNGUELTIG', meldung: 'Ungültiger Orts-Slug.' });
  }
  const titel = bereinigeTitel(e.titel);
  if (istKeinTermin(titel)) {
    fehler.push({
      feld: 'titel',
      code: 'KEIN_TERMIN',
      meldung: 'Eintrag beschreibt keine Veranstaltung.',
    });
  } else if (!titel || titel.length > TITEL_MAX) {
    fehler.push({
      feld: 'titel',
      code: 'TITEL_LAENGE',
      meldung: `Titel muss 1–${TITEL_MAX} Zeichen lang sein.`,
    });
  }
  const band = bereinigeBand(e.band);
  if (band && band.length > BAND_MAX) {
    fehler.push({ feld: 'band', code: 'BAND_LAENGE', meldung: `Band: max. ${BAND_MAX} Zeichen.` });
  }
  const pfarrer = e.pfarrer?.replace(/\s+/g, ' ').trim() || null;
  if (pfarrer && pfarrer.length > BAND_MAX) {
    fehler.push({
      feld: 'pfarrer',
      code: 'PFARRER_LAENGE',
      meldung: `Pfarrer/in: max. ${BAND_MAX} Zeichen.`,
    });
  }
  const info = e.info?.trim().replace(/\r\n/g, '\n') || null;
  if (info && info.length > INFO_MAX) {
    fehler.push({
      feld: 'info',
      code: 'INFO_LAENGE',
      meldung: `Hinweise: max. ${INFO_MAX} Zeichen.`,
    });
  }
  if (e.beginn != null && !UHRZEIT.test(e.beginn)) {
    fehler.push({ feld: 'beginn', code: 'UHRZEIT_UNGUELTIG', meldung: 'Uhrzeit im Format HH:MM.' });
  }
  const kategorie = kategorieAus(e.kategorie);
  if (!kategorie) {
    fehler.push({
      feld: 'kategorie',
      code: 'KATEGORIE_UNBEKANNT',
      meldung: `Unbekannte Kategorie „${e.kategorie}“.`,
    });
  }

  if (fehler.length || !datum.ok || !landkreis.ok || !kategorie) {
    return err(fehler);
  }

  const termin: NeuerTermin = {
    ortSlug: e.ortSlug,
    landkreis: landkreis.value,
    datum: datum.value,
    beginn: e.beginn ?? null,
    titel,
    veranstaltungsort: e.veranstaltungsort?.trim() || null,
    kategorie,
    bestaetigt: e.bestaetigt ?? false,
    band,
    pfarrer,
    info,
    muttizettel: e.muttizettel ?? false,
  };
  const hinweise: Hinweis[] = [];
  if (/kirmes|kirmse|kirchweih/i.test(termin.titel) && !istHerbstKirmes(termin.datum)) {
    hinweise.push({
      code: 'KIRMES_AUSSERHALB_HERBST',
      meldung: 'Kirmes liegt außerhalb der traditionellen Herbstsaison (Sep–Nov). Bitte prüfen.',
    });
  }
  return ok({ termin, hinweise });
}
