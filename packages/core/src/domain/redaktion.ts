/** Fachregeln für Inhalte, die nur die Redaktion (Admin) anlegt: Mitteilungen und eigene Orte. */
import { parseKoordinate, type Koordinate } from './festplatz.js';
import { parseLandkreis, type LandkreisKuerzel } from './landkreis.js';
import { err, ok, type Result, type Validierungsfehler } from './result.js';

// ── Mitteilungen ────────────────────────────────────────────────────────────────────────
export interface MitteilungEingabe {
  titel: string;
  text: string;
  link?: string | null;
}
export interface NeueMitteilung {
  readonly titel: string;
  readonly text: string;
  /** Nur https:// oder seiteninterne Pfade – kein javascript:, data: o. ä. */
  readonly link: string | null;
}
export interface Mitteilung extends NeueMitteilung {
  readonly id: string;
  readonly veroeffentlichtAm: string | null;
  readonly erstelltAm: string;
}

export function validiereMitteilung(
  e: MitteilungEingabe,
): Result<NeueMitteilung, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];
  const titel = e.titel.trim().replace(/\s+/g, ' ');
  const text = e.text
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  const link = e.link?.trim() || null;
  if (!titel || titel.length > 120) {
    fehler.push({ feld: 'titel', code: 'TITEL_LAENGE', meldung: 'Titel: 1–120 Zeichen.' });
  }
  if (!text || text.length > 2000) {
    fehler.push({ feld: 'text', code: 'TEXT_LAENGE', meldung: 'Text: 1–2000 Zeichen.' });
  }
  if (link && !/^(https:\/\/[^\s]+|\/[^\s/][^\s]*|\/)$/.test(link)) {
    fehler.push({
      feld: 'link',
      code: 'LINK_UNGUELTIG',
      meldung: 'Link muss mit https:// oder / beginnen.',
    });
  }
  return fehler.length ? err(fehler) : ok({ titel, text, link });
}

// ── Eigene Orte ─────────────────────────────────────────────────────────────────────────
/** „Mühlberg (Gotha)“ → „muehlberg-gotha“ – dieselbe Regel wie im Ortsverzeichnis. */
export const slugAus = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface OrtEingabe {
  name: string;
  landkreis: string;
  lat?: unknown;
  lon?: unknown;
}
export interface NeuerOrt {
  readonly slug: string;
  readonly name: string;
  readonly landkreis: LandkreisKuerzel;
  readonly koordinate: Koordinate | null;
}

export function validiereOrt(e: OrtEingabe): Result<NeuerOrt, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];
  const name = e.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) {
    fehler.push({ feld: 'name', code: 'NAME_LAENGE', meldung: 'Ortsname: 1–120 Zeichen.' });
  }
  const kreis = parseLandkreis(e.landkreis);
  if (!kreis.ok) fehler.push(kreis.error);
  let koordinate: Koordinate | null = null;
  const leer = (v: unknown) => v === undefined || v === null || v === '';
  if (!(leer(e.lat) && leer(e.lon))) {
    const k = parseKoordinate(e.lat, e.lon);
    if (k.ok) koordinate = k.value;
    else fehler.push(k.error);
  }
  if (fehler.length || !kreis.ok) return err(fehler);
  return ok({ slug: slugAus(name), name, landkreis: kreis.value, koordinate });
}

/**
 * Koordinaten aus eingefügtem Text: „50.8712, 10.8213“ oder Google-Maps-/Apple-Karten-Links
 * (…/@50.87,10.82,17z · ?q=50.87,10.82 · !3d50.87!4d10.82 · ?ll=…).
 */
export function koordinateAusText(text: string): { lat: number; lon: number } | null {
  // Reihenfolge: gesetzter Pin (!3d…!4d) vor Suchparameter vor Kartenmitte (@…) – die Mitte des
  // Ausschnitts liegt oft neben dem eigentlichen Ort (Issue #62)
  const m =
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(text) ??
    /[?&](?:q|query|ll|daddr|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(text) ??
    /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(text) ??
    /^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/.exec(text);
  if (!m) return null;
  const [, a = '', b = ''] = m;
  // Die Muster lassen nur Dezimalzahlen zu – Number() ist hier immer endlich.
  return { lat: Number(a.replace(',', '.')), lon: Number(b.replace(',', '.')) };
}

/** Kurzlink aus „Teilen → Link kopieren“ in Google Maps (muss aufgelöst werden, enthält keine Koordinaten). */
export const istKartenKurzlink = (text: string) =>
  /^\s*https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+\S*\s*$/.test(text);
