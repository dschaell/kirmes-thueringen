/**
 * Mittagstisch am Termin (Issue #66): Gerichte mit optionalem Preis, z. B. beim Frühschoppen.
 * Preise werden in Cent gespeichert; Eingabe mit Komma oder Punkt, „€“ ist erlaubt.
 */
import { err, ok, type Result, type Validierungsfehler } from './result.js';

export interface Speise {
  readonly name: string;
  /** null = ohne Preisangabe */
  readonly preisCent: number | null;
}

export const SPEISEN_MAX = 20;
export const SPEISE_NAME_MAX = 120;
/** 1000 € – darüber ist es sicher ein Tippfehler */
export const PREIS_MAX_CENT = 100_000;

/** „9,50“, „9.5“, „9 €“, „€ 12“ → Cent; leer → null; unlesbar → undefined */
export function preisAus(text: string): number | null | undefined {
  const t = text.replace(/€|eur(o)?/gi, '').replace(/\s+/g, '');
  if (!t) return null;
  const m = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

/** Leere Zeilen werden übersprungen; Reihenfolge bleibt erhalten. */
export function validiereSpeisen(
  zeilen: readonly { name: string; preis: string }[],
): Result<Speise[], Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];
  const speisen: Speise[] = [];
  zeilen.forEach((z, i) => {
    const name = z.name.trim().replace(/\s+/g, ' ');
    const preisText = z.preis.trim();
    if (!name && !preisText) return;
    const nr = `Essen/Getränk ${i + 1}`;
    if (!name) {
      fehler.push({ feld: `speise${i + 1}.name`, code: 'PFLICHT', meldung: `${nr}: Name fehlt.` });
      return;
    }
    if (name.length > SPEISE_NAME_MAX) {
      fehler.push({
        feld: `speise${i + 1}.name`,
        code: 'NAME_LAENGE',
        meldung: `${nr}: höchstens ${SPEISE_NAME_MAX} Zeichen.`,
      });
      return;
    }
    const preis = preisAus(preisText);
    if (preis === undefined || (preis !== null && preis > PREIS_MAX_CENT)) {
      fehler.push({
        feld: `speise${i + 1}.preis`,
        code: 'PREIS',
        meldung: `${nr}: Preis bitte wie „9,50“ angeben (höchstens 1000 €).`,
      });
      return;
    }
    speisen.push({ name, preisCent: preis });
  });
  if (speisen.length > SPEISEN_MAX) {
    fehler.push({
      feld: 'speisen',
      code: 'ZU_VIELE',
      meldung: `Höchstens ${SPEISEN_MAX} Einträge bei Essen & Getränke.`,
    });
  }
  return fehler.length ? err(fehler) : ok(speisen);
}
