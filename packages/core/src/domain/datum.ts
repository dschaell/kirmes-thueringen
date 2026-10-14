import { err, ok, type Result, type Validierungsfehler } from './result.js';

/** Kalenderdatum ohne Uhrzeit/Zeitzone im Format YYYY-MM-DD. */
export type KalenderDatum = string & { readonly __brand: 'KalenderDatum' };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const TAG_MS = 86_400_000;

export function parseDatum(
  wert: string,
  feld = 'datum',
): Result<KalenderDatum, Validierungsfehler> {
  const m = ISO.exec(wert);
  if (m) {
    const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(j, mo - 1, t));
    if (d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t) {
      return ok(wert as KalenderDatum);
    }
  }
  return err({
    feld,
    code: 'DATUM_UNGUELTIG',
    meldung: `„${wert}“ ist kein gültiges Datum (YYYY-MM-DD).`,
  });
}

export const plusTage = (d: KalenderDatum, tage: number): KalenderDatum =>
  new Date(Date.parse(d) + tage * TAG_MS).toISOString().slice(0, 10) as KalenderDatum;

export const tageZwischen = (von: KalenderDatum, bis: KalenderDatum): number =>
  Math.round((Date.parse(bis) - Date.parse(von)) / TAG_MS);

export const monatVon = (d: KalenderDatum): number => Number(d.slice(5, 7));

/** Geschlossenes Intervall [von, bis]. */
export interface Datumsbereich {
  readonly von: KalenderDatum;
  readonly bis: KalenderDatum;
}

export const MAX_BEREICH_TAGE = 366;

export function erstelleDatumsbereich(
  von: KalenderDatum,
  bis: KalenderDatum,
): Result<Datumsbereich, Validierungsfehler> {
  if (bis < von) {
    return err({ feld: 'bis', code: 'BEREICH_UMGEKEHRT', meldung: '„bis“ liegt vor „von“.' });
  }
  if (tageZwischen(von, bis) > MAX_BEREICH_TAGE) {
    return err({
      feld: 'bis',
      code: 'BEREICH_ZU_GROSS',
      meldung: `Der Zeitraum darf höchstens ${MAX_BEREICH_TAGE} Tage umfassen.`,
    });
  }
  return ok({ von, bis });
}
