import { monatVon, parseDatum, type KalenderDatum } from './datum.js';
import { parseLandkreis, type LandkreisKuerzel } from './landkreis.js';
import { err, ok, type Result, type Validierungsfehler } from './result.js';

export const KATEGORIEN = [
  'kirmes',
  'kinder',
  'tanz',
  'party',
  'brauchtum',
  'ostern',
  'mai',
  'fruehschoppen',
] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

export interface Ort {
  readonly slug: string;
  readonly name: string;
  readonly landkreis: LandkreisKuerzel;
  /** WGS84, null solange nicht geokodiert */
  readonly koordinate: { lat: number; lon: number } | null;
}

export interface Termin {
  readonly id: string;
  readonly ort: Ort;
  readonly datum: KalenderDatum;
  readonly beginn: string | null; // HH:MM
  readonly titel: string;
  readonly veranstaltungsort: string | null;
  readonly kategorie: Kategorie;
  /** false = aus Vorjahren hochgerechnet, vom Veranstalter nicht bestätigt */
  readonly bestaetigt: boolean;
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
}

/** Validierte Eingabe, bereit zum Speichern. */
export interface NeuerTermin {
  readonly ortSlug: string;
  readonly landkreis: LandkreisKuerzel;
  readonly datum: KalenderDatum;
  readonly beginn: string | null;
  readonly titel: string;
  readonly veranstaltungsort: string | null;
  readonly kategorie: Kategorie;
  readonly bestaetigt: boolean;
}

export interface Hinweis {
  code: string;
  meldung: string;
}

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITEL_MAX = 200;

/** Herbst = traditionelle Kirmeszeit in Thüringen (Kirchweih nach der Ernte). */
export const HERBST_MONATE = [9, 10, 11] as const;
export const istHerbstKirmes = (d: KalenderDatum): boolean =>
  (HERBST_MONATE as readonly number[]).includes(monatVon(d));

const istKategorie = (k: string): k is Kategorie => (KATEGORIEN as readonly string[]).includes(k);

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

  if (!SLUG.test(e.ortSlug)) {
    fehler.push({ feld: 'ortSlug', code: 'SLUG_UNGUELTIG', meldung: 'Ungültiger Orts-Slug.' });
  }
  const titel = e.titel.trim();
  if (!titel || titel.length > TITEL_MAX) {
    fehler.push({
      feld: 'titel',
      code: 'TITEL_LAENGE',
      meldung: `Titel muss 1–${TITEL_MAX} Zeichen lang sein.`,
    });
  }
  if (e.beginn != null && !UHRZEIT.test(e.beginn)) {
    fehler.push({ feld: 'beginn', code: 'UHRZEIT_UNGUELTIG', meldung: 'Uhrzeit im Format HH:MM.' });
  }
  if (!istKategorie(e.kategorie)) {
    fehler.push({
      feld: 'kategorie',
      code: 'KATEGORIE_UNBEKANNT',
      meldung: `Unbekannte Kategorie „${e.kategorie}“.`,
    });
  }

  if (fehler.length || !datum.ok || !landkreis.ok || !istKategorie(e.kategorie)) {
    return err(fehler);
  }

  const termin: NeuerTermin = {
    ortSlug: e.ortSlug,
    landkreis: landkreis.value,
    datum: datum.value,
    beginn: e.beginn ?? null,
    titel,
    veranstaltungsort: e.veranstaltungsort?.trim() || null,
    kategorie: e.kategorie,
    bestaetigt: e.bestaetigt ?? false,
  };
  const hinweise: Hinweis[] = [];
  if (termin.kategorie === 'kirmes' && !istHerbstKirmes(termin.datum)) {
    hinweise.push({
      code: 'KIRMES_AUSSERHALB_HERBST',
      meldung: 'Kirmes liegt außerhalb der traditionellen Herbstsaison (Sep–Nov). Bitte prüfen.',
    });
  }
  return ok({ termin, hinweise });
}
