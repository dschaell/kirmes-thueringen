import type { Speise } from '../domain/speisen.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import type { Hinweis, NeuerTermin, Termin } from '../domain/termin.js';
import type { Berechtigung } from './festplaetze.js';

/** Driven Port: Termine einer Kirmesgesellschaft schreiben – immer mit Protokolleintrag. */
export interface TerminVerwaltung {
  lege(t: NeuerTermin, durch: Berechtigung): Promise<Termin>;
  /** Mehrere Termine in EINER Transaktion – alle oder keiner */
  legeAlle(t: NeuerTermin[], durch: Berechtigung): Promise<Termin[]>;
  /** false, wenn der Termin nicht existiert oder zu einem anderen Ort gehört */
  aendere(id: string, t: NeuerTermin, durch: Berechtigung): Promise<boolean>;
  /**
   * Mehrere Termine ändern und/oder löschen in EINER Transaktion. false (und nichts geändert),
   * wenn ein Termin nicht existiert oder zu einem anderen Ort gehört.
   */
  aendereAlle(
    aenderungen: { id: string; termin: NeuerTermin }[],
    loeschen: string[],
    durch: Berechtigung,
    versionen?: Record<string, string>,
  ): Promise<boolean>;
  /** Mittagstisch eines Termins ersetzen (Issue #66); false = Termin nicht gefunden/fremder Ort */
  setzeSpeisen(
    id: string,
    speisen: readonly Speise[],
    durch: Berechtigung,
    version?: string,
  ): Promise<boolean>;
  bestaetige(id: string, durch: Berechtigung, version?: string): Promise<boolean>;
  loesche(id: string, durch: Berechtigung, version?: string): Promise<boolean>;
}

/** Was im Terminformular eingegeben wird – Ort und Landkreis setzt der Aufrufer. */
export interface TerminFormular {
  version?: string;
  speisen?: { name: string; preis: string }[];
  datum: string;
  beginn?: string | null;
  titel: string;
  veranstaltungsort?: string | null;
  kategorie?: string | null;
  band?: string | null;
  pfarrer?: string | null;
  veranstalter?: string | null;
  eintritt?: string | null;
  ende?: string | null;
  info?: string | null;
  muttizettel?: boolean;
}

/** Höchstzahl Veranstaltungen, die auf einmal angelegt werden (ein langes Kirmeswochenende). */
export const MAX_VERANSTALTUNGEN = 20;

/**
 * Validiert mehrere Termine; Fehler tragen die Zeilennummer im Feldnamen („zeile3.datum“)
 * und in der Meldung, damit die Oberfläche die richtige Zeile markieren kann.
 */
export function validiereAlle<T>(
  eintraege: T[],
  einzeln: (e: T) => Result<{ termin: NeuerTermin; hinweise: Hinweis[] }, Validierungsfehler[]>,
): Result<{ termine: NeuerTermin[]; hinweise: Hinweis[] }, Validierungsfehler[]> {
  if (eintraege.length === 0 || eintraege.length > MAX_VERANSTALTUNGEN) {
    return err([
      {
        feld: 'zeilen',
        code: 'ANZAHL_UNGUELTIG',
        meldung: `1–${MAX_VERANSTALTUNGEN} Veranstaltungen auf einmal.`,
      },
    ]);
  }
  const fehler: Validierungsfehler[] = [];
  const termine: NeuerTermin[] = [];
  const hinweise: Hinweis[] = [];
  eintraege.forEach((e, i) => {
    const v = einzeln(e);
    if (v.ok) {
      termine.push(v.value.termin);
      hinweise.push(
        ...v.value.hinweise.map((h) => ({ ...h, meldung: `Zeile ${i + 1}: ${h.meldung}` })),
      );
    } else {
      fehler.push(
        ...v.error.map((f) => ({
          ...f,
          feld: `zeile${i + 1}.${f.feld}`,
          meldung: `Zeile ${i + 1}: ${f.meldung}`,
        })),
      );
    }
  });
  const doppelt = termine.findIndex(
    (t, i) => termine.findIndex((u) => u.datum === t.datum && u.titel === t.titel) !== i,
  );
  if (doppelt >= 0) {
    fehler.push({
      feld: `zeile${doppelt + 1}.titel`,
      code: 'DOPPELT',
      meldung: `Zeile ${doppelt + 1}: Gleicher Titel am gleichen Tag kommt doppelt vor.`,
    });
  }
  return fehler.length ? err(fehler) : ok({ termine, hinweise });
}
