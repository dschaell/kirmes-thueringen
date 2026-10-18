/**
 * Recherche-Tabelle → Termine. Die Redaktion pflegt eine Tabelle (Google Sheets / Excel) und
 * exportiert sie als CSV. Hier wird jede Zeile tolerant gelesen und in eine TerminEingabe übersetzt;
 * die eigentlichen Fachregeln prüft danach validiereTermin.
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import { bereinigeTitel } from '../domain/text.js';
import type { Kategorie } from '../domain/termin.js';

/**
 * RFC-4180-CSV mit automatischer Erkennung von Tabulator (aus Excel/Sheets eingefügt, Issue #105),
 * „;“ (deutsches Excel) oder „,“.
 */
export function parseCsv(text: string): string[][] {
  const inhalt = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // Byte-Order-Mark aus Excel
  const ersteZeile = inhalt.split(/\r?\n/, 1)[0] ?? '';
  const anzahl = (z: string) => ersteZeile.split(z).length - 1;
  const trenner =
    anzahl('\t') > 0 && anzahl('\t') >= anzahl(';') && anzahl('\t') >= anzahl(',')
      ? '\t'
      : anzahl(';') > anzahl(',')
        ? ';'
        : ',';
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = '';
  let inAnfuehrung = false;
  for (let i = 0; i < inhalt.length; i++) {
    const c = inhalt[i];
    if (inAnfuehrung) {
      if (c === '"' && inhalt[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnfuehrung = false;
      else feld += c;
    } else if (c === '"' && feld === '') inAnfuehrung = true;
    else if (c === trenner) {
      zeile.push(feld);
      feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && inhalt[i + 1] === '\n') i++;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else feld += c;
  }
  if (feld !== '' || zeile.length) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen.filter((z) => z.some((f) => f.trim() !== ''));
}

/** Kategorie aus dem Titel ableiten, wenn die Tabelle keine angibt. */
/**
 * Art aus dem Titel (Issue #64): Familien & Kinder, Tradition oder – sonst – Tanz & Party.
 * Erkennt auch gängige Schreibweisen („Frühshoppen“, „Früh-Schoppen“).
 */
export function erkenneKategorie(titel: string): Kategorie {
  const t = titel.toLowerCase();
  if (/kinder|familie/.test(t)) return 'familie';
  if (
    /gottesdienst|andacht|messe\b|kirchgang|ständchen|staendchen|umzug|beerdigung|kirmesbaum|baumsetzen|baum stellen|kirmesspiele|ausklang|platzkonzert|oster|fr(ü|ue|u)h\s*-?\s*sc?h?oppen/.test(
      t,
    )
  )
    return 'tradition';
  return 'party';
}

/** Spaltennamen der Vorlage (Groß-/Kleinschreibung und Umlaute egal). */
export const RECHERCHE_SPALTEN = [
  'ort',
  'landkreis',
  'datum',
  'beginn',
  'titel',
  'veranstaltungsort',
  'kategorie',
  'bestaetigt',
  'quelle',
  'band',
  'hinweise',
  'muttizettel',
] as const;

export interface RechercheZeile {
  ort: string;
  landkreis: string | null;
  datum: string;
  beginn: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: string;
  bestaetigt: boolean;
  quelle: string | null;
  band: string | null;
  info: string | null;
  muttizettel: boolean;
}

/** Gängige Spaltennamen aus eigenen Tabellen (Issue #105) */
const SPALTEN_ALIAS: Record<string, string> = {
  art: 'kategorie',
  uhrzeit: 'beginn',
  zeit: 'beginn',
  uhr: 'beginn',
  wo: 'veranstaltungsort',
  platz: 'veranstaltungsort',
  ortderveranstaltung: 'veranstaltungsort',
  musik: 'band',
  dj: 'band',
  banddj: 'band',
  hinweis: 'hinweise',
  info: 'hinweise',
  infos: 'hinweise',
  u: 'muttizettel',
  veranstaltung: 'titel',
  kreis: 'landkreis',
  tag: 'datum',
};
const normSpalte = (s: string) => {
  const n = s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z]/g, '');
  return SPALTEN_ALIAS[n] ?? n;
};

/** „18.10.2026“, „18.10.26“, „2026-10-18“ → „2026-10-18“ (Prüfung auf gültiges Datum folgt im Domain). */
export function normDatum(roh: string): string {
  const s = roh.trim();
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (de) {
    const [, tag = '', monat = '', jahr = ''] = de;
    return `${jahr.length === 2 ? `20${jahr}` : jahr}-${monat.padStart(2, '0')}-${tag.padStart(2, '0')}`;
  }
  return s;
}

/** „20:00“, „20.00“, „20 Uhr“, „9:30“ → „HH:MM“; leer → null. */
export function normUhrzeit(roh: string): string | null {
  const s = roh
    .trim()
    .toLowerCase()
    .replace(/\s*uhr$/, '');
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(s);
  if (!m) return roh.trim();
  const [, stunde = '', minute = '00'] = m;
  return `${stunde.padStart(2, '0')}:${minute}`;
}

const JA = /^(ja|j|x|true|1|bestätigt|bestaetigt)$/i;

/** Liest die CSV-Zeilen (erste Zeile = Spaltenköpfe) in RechercheZeilen; Fehler mit Zeilennummer. */
export function leseRecherche(
  zeilen: string[][],
): Result<{ zeile: number; daten: RechercheZeile }[], Validierungsfehler[]> {
  const [kopf, ...rest] = zeilen;
  if (!kopf) return err([{ feld: 'datei', code: 'LEER', meldung: 'Die Tabelle ist leer.' }]);
  const index = new Map(kopf.map((k, i) => [normSpalte(k), i]));
  const fehlend = ['ort', 'datum', 'titel'].filter((s) => !index.has(s));
  if (fehlend.length) {
    return err([
      {
        feld: 'kopfzeile',
        code: 'SPALTE_FEHLT',
        meldung: `Pflichtspalten fehlen: ${fehlend.join(', ')} (erwartet: ${RECHERCHE_SPALTEN.join(', ')})`,
      },
    ]);
  }
  const wert = (z: string[], spalte: string) => (z[index.get(spalte) ?? -1] ?? '').trim();
  return ok(
    rest.map((z, i) => {
      const titel = wert(z, 'titel');
      const kategorie = wert(z, 'kategorie').toLowerCase();
      return {
        zeile: i + 2, // Zeile 1 ist der Kopf
        daten: {
          ort: wert(z, 'ort'),
          landkreis: wert(z, 'landkreis').toUpperCase() || null,
          datum: normDatum(wert(z, 'datum')),
          beginn: normUhrzeit(wert(z, 'beginn')),
          titel,
          veranstaltungsort: wert(z, 'veranstaltungsort') || null,
          kategorie: kategorie || erkenneKategorie(bereinigeTitel(titel)),
          bestaetigt: JA.test(wert(z, 'bestaetigt')),
          quelle: wert(z, 'quelle') || null,
          band: wert(z, 'band') || null,
          info: wert(z, 'hinweise') || null,
          muttizettel: JA.test(wert(z, 'muttizettel')),
        },
      };
    }),
  );
}
