import type { Kategorie } from '@kirmes/core';
import { plusTage } from '../src/lib/anzeige';
import type { AssistentZeile } from '../src/lib/assistent';

/**
 * Testdaten (Issue #221): das frühere Vorlage-Programm einer typischen Kirmes. Der Assistent startet
 * inzwischen ohne Vorlage; die Tests brauchen trotzdem ein realistisches Programm.
 */
export interface WochenendZeile {
  datum: string;
  beginn: string;
  titel: string;
  /** leer = automatisch aus dem Titel erkennen */
  kategorie: Kategorie | '';
  band: string;
  veranstaltungsort: string;
  info: string;
  muttizettel: boolean;
  /** Findet bei fast jeder Kirmes statt – im Assistenten vorab angehakt (Issue #87). */
  kern?: boolean;
}

/**
 * Vorlage für eine typische Thüringer Kirmes ab dem ersten Kirmestag (meist Freitag) bis Montag.
 * Abgeleitet aus einer echten Kirmes (Alkersleben 2026, Issue #62): Gottesdienst und Tanz am
 * Freitag, Ständchen, Kinderkirmes und Party am Samstag, Frühschoppen am Sonntag, Ausklang am
 * Montag. Nur ein Vorschlag – Zeilen ohne Veranstaltung werden nicht gespeichert.
 */
export function wochenendVorlage(ab: string): WochenendZeile[] {
  const zeile = (
    tag: number,
    beginn: string,
    titel: string,
    kategorie: Kategorie,
    extra: Partial<WochenendZeile> = {},
  ): WochenendZeile => ({
    datum: plusTage(ab, tag),
    beginn,
    titel,
    kategorie,
    band: '',
    veranstaltungsort: '',
    info: '',
    muttizettel: false,
    ...extra,
  });
  return [
    zeile(0, '18:00', 'Kirmesgottesdienst', 'tradition', {
      veranstaltungsort: 'Kirche',
      kern: true,
    }),
    zeile(0, '20:00', 'Kirmestanz', 'party', { kern: true }),
    zeile(1, '08:00', 'Ständchen', 'staendchen'),
    zeile(1, '15:00', 'Kinderkirmes', 'familie'),
    zeile(1, '20:00', 'Kirmesparty', 'party', { muttizettel: true }),
    zeile(2, '10:00', 'Frühschoppen', 'fruehschoppen', { kern: true }),
    zeile(3, '10:00', 'Kirmesausklang', 'tradition'),
  ];
}

/** Programm wie früher die Vorlage: n Tage ab `ab`, nur der Kern aktiv. */
export function vorlage(ab: string, tage: string): AssistentZeile[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)) return [];
  if (tage === '1') return [{ datum: ab, titel: '', aktiv: true, beginn: '', speisen: [] }];
  return wochenendVorlage(ab)
    .filter((z) => z.datum < plusTage(ab, Number(tage)))
    .map(({ kern, ...z }) => ({ ...z, aktiv: kern === true, speisen: [] }));
}
