import { plusTage } from './anzeige';

/** Eine Zeile im Formular „Kirmeswochenende anlegen“ (Rohwerte aus dem Formular). */
export interface WochenendZeile {
  datum: string;
  beginn: string;
  titel: string;
  band: string;
  veranstaltungsort: string;
  info: string;
}

/**
 * Vorlage für ein typisches Thüringer Kirmeswochenende ab dem ersten Kirmestag (meist Freitag).
 * Nur ein Vorschlag: Zeilen lassen sich ändern oder leeren.
 */
export function wochenendVorlage(ab: string): WochenendZeile[] {
  const zeile = (tag: number, beginn: string, titel: string): WochenendZeile => ({
    datum: plusTage(ab, tag),
    beginn,
    titel,
    band: '',
    veranstaltungsort: '',
    info: '',
  });
  return [
    zeile(0, '20:00', 'Kirmesdisco'),
    zeile(1, '20:00', 'Kirmestanz'),
    zeile(2, '10:00', 'Frühschoppen'),
    zeile(2, '14:00', 'Kirmesumzug'),
    zeile(2, '20:00', 'Kirmestanz'),
    zeile(3, '10:00', 'Kirmesausklang'),
  ];
}
