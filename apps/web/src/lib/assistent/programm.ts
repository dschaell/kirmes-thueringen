/** Programm des Kirmes-Assistenten: Datentypen, Vorlage, Sortierung, Prüfungen, Lesen (Issue #199). */
import type { VorschlagsZeile } from '@kirmes/core';
import { KATEGORIEN as KATEGORIEN_LISTE, parseDatum, type Kategorie } from '@kirmes/core';
import { datumKurz } from '../anzeige';
import { feld } from '../admin';
import { type TerminDto } from '../api';

export interface AssistentZeile extends VorschlagsZeile {
  gerichte?: number;
  /** Haken „Essen & Getränke anbieten“ (Issue #155); fehlt er, zählt, ob es Einträge gibt */
  essen?: boolean;
  aktiv: boolean;
}
/** Essen & Getränke nur mit Haken – sonst bleiben eingetippte Einträge unberücksichtigt. */
export const mitEssen = (z: AssistentZeile) => z.essen ?? (z.speisen?.length ?? 0) > 0;
export interface AssistentStand {
  schritt: 1 | 2 | 3;
  zeitraumWechsel?: boolean;
  /** Mögliche Doppelungen mit vorhandenen Terminen – erst nach Bestätigung speichern (Issue #178) */
  doppelt?: string[];
  ortSlug: string;
  /** Getippter Ortstext – bleibt bei „Ort nicht gefunden“ im Feld stehen */
  ortEingabe?: string;
  /** Redaktion: Ort nicht im Verzeichnis – ähnliche Orte bzw. „neu anlegen“ anbieten (#167) */
  ortUnbekannt?: boolean;
  /** Vom Vorjahr übernommen (erster Tag damals) – Daten sind geschätzt (Issue #218) */
  vorjahrVon?: string;
  ab: string;
  tage: string;
  zeilen: AssistentZeile[];
  kontaktName: string;
  kontaktEmail: string;
  nachricht: string;
  bestaetigt: boolean;
  geladen: number;
  vorschlag: string;
  fehler: string[];
}
/** Dauer einer Kirmes: Auswahl 1–4 oder eigene Angabe bis 14 Tage (Issue #150). */
export const TAGE_MAX = 14;
export const gueltigeTage = (t: unknown): t is string =>
  typeof t === 'string' && /^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= TAGE_MAX;
/** Leere Veranstaltung – der Assistent startet ohne Vorlage (Issue #221). */
export const neueZeile = (datum: string): AssistentZeile => ({
  datum,
  titel: '',
  beginn: '',
  aktiv: true,
  speisen: [],
});
/**
 * Programm der Reihe nach (Issue #149): Tag, dann Uhrzeit; ohne Uhrzeit ans Ende des Tages.
 * Stabil – gleiche Zeitpunkte behalten ihre Reihenfolge.
 */
export const sortiereProgramm = <T extends { datum: string; beginn?: string | null }>(
  zeilen: T[],
): T[] =>
  [...zeilen].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) || (a.beginn || '99:99').localeCompare(b.beginn || '99:99'),
  );

/** Gleicher Titel am gleichen Tag ist nicht erlaubt (ein Termin je Ort, Tag und Titel). */
export function doppelterTitel(zeilen: AssistentZeile[]): string | null {
  const gesehen = new Set<string>();
  for (const z of zeilen.filter((z) => z.aktiv)) {
    const schluessel = `${z.datum}|${z.titel.trim().toLowerCase()}`;
    if (gesehen.has(schluessel))
      return `„${z.titel.trim()}“ steht am ${datumKurz(z.datum)} zweimal im Programm. Bitte einen der beiden anders nennen (z. B. „${z.titel.trim()} am Nachmittag“) oder auf einen anderen Tag legen.`;
    gesehen.add(schluessel);
  }
  return null;
}
/**
 * Mögliche Doppelungen (Issue #178): gleicher Ort und Tag mit gleichem Titel oder Beginn höchstens
 * eine Stunde auseinander. Zwei Leute in der Redaktion sollen nicht dieselbe Kirmes zweimal anlegen.
 */
export function moeglicheDoppelungen(
  neu: { datum: string; beginn?: string | null; titel: string }[],
  vorhanden: Pick<TerminDto, 'datum' | 'beginn' | 'titel'>[],
): string[] {
  const minuten = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const hinweise: string[] = [];
  for (const n of neu)
    for (const v of vorhanden) {
      if (v.datum !== n.datum) continue;
      const gleicherTitel = v.titel.trim().toLowerCase() === n.titel.trim().toLowerCase();
      const naheZeit =
        !!n.beginn && !!v.beginn && Math.abs(minuten(n.beginn) - minuten(v.beginn)) <= 60;
      if (gleicherTitel || naheZeit)
        hinweise.push(
          `„${n.titel}“: am ${datumKurz(n.datum)} gibt es schon „${v.titel}“${v.beginn ? ` um ${v.beginn} Uhr` : ''}.`,
        );
    }
  return hinweise;
}
export const istKategorie = (k: string | null | undefined): k is Kategorie =>
  !!k && (KATEGORIEN_LISTE as readonly string[]).includes(k);
/** Felder je Zeile über den Index (titel-0, datum-0 …); Reihenfolge wie im Formular. */
export function leseProgramm(
  f: FormData,
  alt: AssistentZeile[],
  details: boolean,
): AssistentZeile[] {
  return alt.slice(0, 20).map((z, i) =>
    details && !z.aktiv
      ? z
      : {
          ...z,
          ...(details
            ? {
                band: feld(f, `band-${i}`),
                pfarrer: feld(f, `pfarrer-${i}`),
                veranstaltungsort: feld(f, `wo-${i}`),
                info: feld(f, `info-${i}`),
                muttizettel: f.has(`mutti-${i}`),
                essen: f.has(`essen-${i}`),
                // Kartenlink (öffentlich) bzw. Haken „als Platz übernehmen“ (Redaktion) – Issue #169
                karte: feld(f, `karte-${i}`).slice(0, 2000),
                platzUebernehmen: f.has(`platz-${i}`),
                speisen: Array.from(
                  { length: Math.min(20, Math.max(z.gerichte ?? 3, (z.speisen?.length ?? 0) + 1)) },
                  (_, j) => ({
                    name: feld(f, `gericht-${i}-${j}`),
                    preis: feld(f, `preis-${i}-${j}`),
                  }),
                ).filter((s) => s.name || s.preis),
              }
            : {
                // Nicht Benötigtes wird gelöscht statt abgewählt (Issue #221)
                aktiv: true,
                datum: feld(f, `datum-${i}`),
                beginn: feld(f, `beginn-${i}`),
                titel: feld(f, `titel-${i}`),
                // Art wählbar (Issue #93); leer = beim Speichern aus dem Titel erkennen
                kategorie: istKategorie(feld(f, `kat-${i}`)) ? feld(f, `kat-${i}`) : null,
              }),
        },
  );
}
export function leseStand(s: string): AssistentStand | null {
  if (s.length > 200_000) return null;
  try {
    const v = JSON.parse(s) as AssistentStand;
    if (
      ![1, 2, 3].includes(v.schritt) ||
      typeof v.ortSlug !== 'string' ||
      (v.ortEingabe !== undefined && typeof v.ortEingabe !== 'string') ||
      (v.doppelt !== undefined &&
        (!Array.isArray(v.doppelt) || !v.doppelt.every((x) => typeof x === 'string'))) ||
      (v.ortUnbekannt !== undefined && typeof v.ortUnbekannt !== 'boolean') ||
      (v.vorjahrVon !== undefined &&
        (typeof v.vorjahrVon !== 'string' || !parseDatum(v.vorjahrVon).ok)) ||
      typeof v.ab !== 'string' ||
      !gueltigeTage(v.tage) ||
      !Array.isArray(v.zeilen) ||
      v.zeilen.length > 20 ||
      !v.zeilen.every(
        (z) =>
          z &&
          typeof z.titel === 'string' &&
          typeof z.datum === 'string' &&
          (v.schritt !== 3 || !z.aktiv || parseDatum(z.datum).ok) &&
          (z.essen === undefined || typeof z.essen === 'boolean') &&
          (z.gerichte === undefined ||
            (Number.isInteger(z.gerichte) && z.gerichte >= 3 && z.gerichte <= 20)) &&
          (z.karte === undefined || (typeof z.karte === 'string' && z.karte.length <= 2000)) &&
          (z.platz === undefined ||
            z.platz === null ||
            (typeof z.platz.lat === 'number' && typeof z.platz.lon === 'number')) &&
          (z.platzUebernehmen === undefined || typeof z.platzUebernehmen === 'boolean') &&
          (z.speisen === undefined ||
            (Array.isArray(z.speisen) &&
              z.speisen.length <= 20 &&
              z.speisen.every((s) => typeof s.name === 'string' && typeof s.preis === 'string'))),
      ) ||
      typeof v.kontaktName !== 'string' ||
      typeof v.kontaktEmail !== 'string' ||
      typeof v.nachricht !== 'string' ||
      typeof v.vorschlag !== 'string' ||
      typeof v.geladen !== 'number'
    )
      return null;
    return { ...v, fehler: [] };
  } catch {
    return null;
  }
}
