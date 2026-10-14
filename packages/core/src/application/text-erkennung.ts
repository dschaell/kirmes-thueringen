/**
 * Recherche-Assistent: liest aus dem Text einer Ankündigung (Instagram, Facebook, Amtsblatt)
 * Datum, Uhrzeit, Titel und Veranstaltungsort heraus. Ergebnis ist ein VORSCHLAG für das
 * Formular – die Redaktion prüft und speichert selbst.
 */
import { bereinigeTitel } from '../domain/text.js';

const MONATE: Record<string, number> = {
  januar: 1,
  jan: 1,
  februar: 2,
  feb: 2,
  märz: 3,
  maerz: 3,
  mär: 3,
  april: 4,
  apr: 4,
  mai: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
};

export interface TerminVorschlag {
  datum: string | null;
  beginn: string | null;
  titel: string | null;
  veranstaltungsort: string | null;
}

const iso = (j: number, m: number, t: number) =>
  `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;

/** Ohne Jahresangabe: nächstes Vorkommen ab heute (Ankündigungen liegen in der Zukunft). */
function mitJahr(m: number, t: number, jahr: string | undefined, heute: string): string {
  if (jahr) return iso(jahr.length === 2 ? 2000 + Number(jahr) : Number(jahr), m, t);
  const j = Number(heute.slice(0, 4));
  const kandidat = iso(j, m, t);
  return kandidat >= heute ? kandidat : iso(j + 1, m, t);
}

function findeDatum(text: string, heute: string): string | null {
  const t = text.toLowerCase();
  // „17.10.2026“, „17.10.26“, „17.10.“
  const zahl = /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?!\d)/.exec(t);
  // „17. Oktober 2026“, „17. okt.“
  const wort = new RegExp(
    `\\b(\\d{1,2})\\.?\\s*(${Object.keys(MONATE).join('|')})\\.?(?:\\s+(\\d{4}))?\\b`,
  ).exec(t);
  // „16. bis 19. Oktober“ / „16.–19. Okt“: Beginn ist der erste Tag
  const spanne = new RegExp(
    `\\b(\\d{1,2})\\.?\\s*(?:bis|–|-)\\s*\\d{1,2}\\.?\\s*(${Object.keys(MONATE).join('|')})\\.?(?:\\s+(\\d{4}))?\\b`,
  ).exec(t);
  const kandidaten = [
    spanne && {
      pos: spanne.index,
      m: MONATE[spanne[2] ?? ''] ?? 0,
      tag: Number(spanne[1]),
      j: spanne[3],
    },
    zahl && { pos: zahl.index, m: Number(zahl[2]), tag: Number(zahl[1]), j: zahl[3] },
    wort && { pos: wort.index, m: MONATE[wort[2] ?? ''] ?? 0, tag: Number(wort[1]), j: wort[3] },
  ].filter((k): k is { pos: number; m: number; tag: number; j: string | undefined } =>
    Boolean(k && k.m >= 1 && k.m <= 12 && k.tag >= 1 && k.tag <= 31),
  );
  const erster = kandidaten.sort((a, b) => a.pos - b.pos)[0];
  return erster ? mitJahr(erster.m, erster.tag, erster.j, heute) : null;
}

function findeUhrzeit(text: string): string | null {
  const m =
    /\b(?:ab|um|beginn:?|einlass:?|start:?)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/i.exec(text) ??
    /\b(?:ab|um|beginn:?|einlass:?|start:?)\s*(\d{1,2})[:.](\d{2})\b/i.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  return h <= 23 ? `${String(h).padStart(2, '0')}:${m[2] ?? '00'}` : null;
}

const SCHLUESSEL =
  /(kirmes|kirmse|kirmestanz|kindertanz|kinderkirmes|frühschoppen|tanz|disco|party|beerdigung|umzug|ständchen|kirchweih)/i;
/** „im Festzelt“, „Kulturhaus Ulla“, „auf dem Sportplatz“ – bis Satzzeichen, Hashtag oder Trennstrich. */
const ORTE =
  /\b(?:im\s+|in\s+der\s+|auf\s+dem\s+|am\s+)?(?:festzelt|zelt|saal|kulturhaus|gemeindehaus|dorfgemeinschaftshaus|sportplatz|festplatz|festwiese|gasthaus|gasthof|scheune|turnhalle)\b[^\n,.!#@|–-]*/i;
const WOCHENTAG = /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b,?/gi;
const DATUM_ZAHL = /\b\d{1,2}\.\d{1,2}\.(\d{2,4})?/g;
const DATUM_WORT = new RegExp(
  `\\b\\d{1,2}\\.?\\s*(${Object.keys(MONATE).join('|')})\\.?(\\s+\\d{4})?`,
  'gi',
);
const UHRZEIT = /\b(ab|um)?\s*\d{1,2}([:.]\d{2})?\s*uhr\b/gi;

function findeTitel(text: string): string | null {
  const zeilen = text
    .split(/\n+/)
    .map((z) =>
      z
        .replace(/[#@][\p{L}\p{N}_]+/gu, '') // Hashtags, Erwähnungen
        .replace(/\p{Extended_Pictographic}|️|‍/gu, '') // Emojis
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((z) => z.length >= 4);
  const treffer = zeilen.find((z) => SCHLUESSEL.test(z)) ?? zeilen[0];
  if (!treffer) return null;

  // Datum, Uhrzeit, Wochentag und Ort entfernen; nur bis zum ersten Komma/Trennstrich
  const ohneAngaben = treffer
    .replace(WOCHENTAG, '')
    .replace(DATUM_ZAHL, '')
    .replace(DATUM_WORT, '')
    .replace(UHRZEIT, '')
    .replace(ORTE, '');
  const ersterTeil = ohneAngaben.split(/\s*,\s*|\s+[-–|]\s+/)[0] ?? '';
  const titel = ersterTeil
    .replace(/\s+(am|vom|im|ab|um|beginn|in|bei)\s*$/i, '')
    .replace(/^[\s:–\-|,!]+|[\s:–\-|,!]+$/g, '');
  return titel ? bereinigeTitel(titel).slice(0, 200) : null;
}

export function erkenneTerminAusText(text: string, heute: string): TerminVorschlag {
  const gefunden = ORTE.exec(text)?.[0]?.trim();
  const ort = gefunden ? gefunden.replace(/^(im|in der|auf dem|am)\s+/i, '') : null;
  return {
    datum: findeDatum(text, heute),
    beginn: findeUhrzeit(text),
    titel: findeTitel(text),
    veranstaltungsort: ort ? ort.charAt(0).toUpperCase() + ort.slice(1, 120) : null,
  };
}
