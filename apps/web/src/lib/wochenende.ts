import type { Kategorie } from '@kirmes/core';
import { plusTage } from './anzeige';

/** Eine Zeile im Formular „Kirmeswochenende anlegen“ (Rohwerte aus dem Formular). */
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
    zeile(0, '18:00', 'Kirmesgottesdienst', 'tradition', { veranstaltungsort: 'Kirche' }),
    zeile(0, '20:00', 'Kirmestanz', 'party'),
    zeile(1, '08:00', 'Ständchen', 'tradition'),
    zeile(1, '15:00', 'Kinderkirmes', 'familie'),
    zeile(1, '20:00', 'Kirmesparty', 'party', { muttizettel: true }),
    zeile(2, '10:00', 'Frühschoppen', 'tradition'),
    zeile(3, '10:00', 'Kirmesausklang', 'tradition'),
  ];
}
