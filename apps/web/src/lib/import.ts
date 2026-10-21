/**
 * Termine aus einer Tabelle übernehmen (Issue #105): einfügen aus Excel/Google Sheets oder CSV.
 * Jede Zeile wird wie beim CLI-Import gelesen (leseRecherche), der Ort tolerant aber eindeutig
 * erkannt, mit den Fachregeln geprüft und gegen vorhandene Termine (Ort + Datum + Titel) verglichen.
 * Der Import ist rein ergänzend: Dubletten werden übersprungen, nie überschrieben.
 */
import {
  KATEGORIEN as KATEGORIE_LISTE,
  erkenneKategorie,
  leseRecherche,
  parseCsv,
  validiereTermin,
} from '@kirmes/core';
import { bezeichner, findeOrtEindeutig, type OrtKurz } from './ortssuche';

export const IMPORT_MAX_ZEILEN = 500;
export const IMPORT_MAX_ZEICHEN = 500_000;

export interface ImportTermin {
  datum: string;
  beginn: string | null;
  titel: string;
  kategorie: string;
  veranstaltungsort: string | null;
  band: string | null;
  info: string | null;
  muttizettel: boolean;
  bestaetigt: boolean;
}
export interface ImportZeile {
  zeile: number;
  status: 'neu' | 'doppelt' | 'fehler';
  meldung?: string;
  ortSlug?: string;
  ortName?: string;
  termin?: ImportTermin;
}

export const terminSchluessel = (datum: string, titel: string) =>
  `${datum}|${titel.trim().toLowerCase()}`;

const kategorie = (roh: string, titel: string) =>
  (KATEGORIE_LISTE as readonly string[]).includes(roh) ? roh : erkenneKategorie(`${roh} ${titel}`);

/** Schritt 1: lesen, Ort erkennen, prüfen. Fehler der ganzen Tabelle als `fehler`. */
export function pruefeTabelle(
  text: string,
  orte: OrtKurz[],
): { fehler: string[]; zeilen: ImportZeile[] } {
  if (!text.trim())
    return { fehler: ['Bitte eine Tabelle einfügen oder eine Datei wählen.'], zeilen: [] };
  if (text.length > IMPORT_MAX_ZEICHEN)
    return { fehler: ['Die Tabelle ist zu groß (höchstens 500.000 Zeichen).'], zeilen: [] };
  const gelesen = leseRecherche(parseCsv(text));
  if (!gelesen.ok) return { fehler: gelesen.error.map((f) => f.meldung), zeilen: [] };
  if (gelesen.value.length > IMPORT_MAX_ZEILEN)
    return {
      fehler: [`Höchstens ${IMPORT_MAX_ZEILEN} Zeilen auf einmal – bitte die Tabelle aufteilen.`],
      zeilen: [],
    };
  const name = bezeichner(orte);
  const zeilen = gelesen.value.map(({ zeile, daten: d }): ImportZeile => {
    const ort = findeOrtEindeutig(orte, d.landkreis ? `${d.ort} (${d.landkreis})` : d.ort);
    if (!ort)
      return {
        zeile,
        status: 'fehler',
        meldung: `Ort „${d.ort}“${d.landkreis ? ` (${d.landkreis})` : ''} nicht eindeutig gefunden – ggf. Spalte „Landkreis“ ergänzen.`,
      };
    const v = validiereTermin({
      ortSlug: ort.slug,
      landkreis: ort.landkreis,
      datum: d.datum,
      beginn: d.beginn,
      titel: d.titel,
      veranstaltungsort: d.veranstaltungsort,
      kategorie: kategorie(d.kategorie, d.titel),
      bestaetigt: d.bestaetigt,
      band: d.band,
      info: d.info,
      muttizettel: d.muttizettel,
    });
    if (!v.ok)
      return {
        zeile,
        status: 'fehler',
        ortSlug: ort.slug,
        ortName: name(ort),
        meldung: v.error.map((f) => f.meldung).join(' '),
      };
    const t = v.value.termin;
    return {
      zeile,
      status: 'neu',
      ortSlug: ort.slug,
      ortName: name(ort),
      termin: {
        datum: t.datum,
        beginn: t.beginn,
        titel: t.titel,
        kategorie: t.kategorie,
        veranstaltungsort: t.veranstaltungsort,
        band: t.band ?? null,
        info: t.info ?? null,
        muttizettel: t.muttizettel ?? false,
        bestaetigt: t.bestaetigt,
      },
    };
  });
  return { fehler: [], zeilen };
}

/** Schritt 2: Dubletten gegen den Bestand und innerhalb der Tabelle markieren. */
export function markiereDubletten(
  zeilen: ImportZeile[],
  vorhanden: Map<string, Set<string>>,
): ImportZeile[] {
  const gesehen = new Set<string>();
  return zeilen.map((z) => {
    if (z.status !== 'neu' || !z.termin || !z.ortSlug) return z;
    const k = terminSchluessel(z.termin.datum, z.termin.titel);
    const voll = `${z.ortSlug}|${k}`;
    if (vorhanden.get(z.ortSlug)?.has(k))
      return { ...z, status: 'doppelt', meldung: 'Gibt es schon – wird übersprungen.' };
    if (gesehen.has(voll))
      return {
        ...z,
        status: 'doppelt',
        meldung: 'Steht doppelt in der Tabelle – nur einmal übernommen.',
      };
    gesehen.add(voll);
    return z;
  });
}

/** Neue Termine je Ort in Blöcken zu höchstens 20 (Grenze der Wochenend-API). */
export function bloecke(zeilen: ImportZeile[]): { ortSlug: string; termine: ImportTermin[] }[] {
  const jeOrt = new Map<string, ImportTermin[]>();
  for (const z of zeilen)
    if (z.status === 'neu' && z.ortSlug && z.termin)
      jeOrt.set(z.ortSlug, [...(jeOrt.get(z.ortSlug) ?? []), z.termin]);
  const ergebnis: { ortSlug: string; termine: ImportTermin[] }[] = [];
  for (const [ortSlug, termine] of jeOrt)
    for (let i = 0; i < termine.length; i += 20)
      ergebnis.push({ ortSlug, termine: termine.slice(i, i + 20) });
  return ergebnis;
}

export const VORLAGE =
  'Ort;Landkreis;Datum;Beginn;Titel;Art;Band;Wo;Hinweise;Muttizettel\r\n' +
  'Alkersleben;IK;16.10.2026;18:00;Kirmesgottesdienst;Gottesdienst;;Kirche;;\r\n' +
  'Alkersleben;IK;16.10.2026;20:00;Kirmestanz;Kirmestanz;Dynamic;Festzelt;Eintritt 8 €;ja\r\n';
