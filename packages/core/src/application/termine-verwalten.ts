import { plusTage } from '../domain/datum.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import { validiereTermin, type Hinweis, type NeuerTermin, type Termin } from '../domain/termin.js';
import type { Bearbeitungslinks, Berechtigung, Verweigert } from './festplaetze.js';
import type { TerminRepository, Uhr } from './ports.js';
import { erkenneKategorie } from './recherche.js';

/** Driven Port: Termine einer Kirmesgesellschaft schreiben – immer mit Protokolleintrag. */
export interface TerminVerwaltung {
  lege(t: NeuerTermin, durch: Berechtigung): Promise<Termin>;
  /** Mehrere Termine in EINER Transaktion – alle oder keiner */
  legeAlle(t: NeuerTermin[], durch: Berechtigung): Promise<Termin[]>;
  /** false, wenn der Termin nicht existiert oder zu einem anderen Ort gehört */
  aendere(id: string, t: NeuerTermin, durch: Berechtigung): Promise<boolean>;
  bestaetige(id: string, durch: Berechtigung): Promise<boolean>;
  loesche(id: string, durch: Berechtigung): Promise<boolean>;
}

/** Was eine Kirmesgesellschaft eingibt – Ort und Landkreis ergeben sich aus ihrem Link. */
export interface TerminFormular {
  datum: string;
  beginn?: string | null;
  titel: string;
  veranstaltungsort?: string | null;
  kategorie?: string | null;
  band?: string | null;
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

const VERWEIGERT: Verweigert = { code: 'NICHT_BERECHTIGT' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Use Cases: Kirmesgesellschaft pflegt die Termine ihres Ortes. Termine der Gesellschaft gelten als
 * vom Veranstalter bestätigt. Ein Link berechtigt nie für fremde Orte.
 */
export class VerwalteTermine {
  constructor(
    private readonly links: Bearbeitungslinks,
    private readonly verwaltung: TerminVerwaltung,
    private readonly termine: TerminRepository,
    private readonly uhr: Uhr,
  ) {}

  /** Termine des eigenen Ortes: 30 Tage zurück bis ein Jahr voraus. */
  async liste(token: string): Promise<Result<Termin[], Verweigert>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const von = plusTage(this.uhr.heute(), -30);
    const seite = await this.termine.suche({
      bereich: { von, bis: plusTage(von, 366) },
      landkreise: [],
      kategorien: [],
      suchtext: null,
      ortSlug: b.ortSlug,
      nurBestaetigt: false,
      limit: 200,
      offset: 0,
    });
    return ok(seite.eintraege);
  }

  async lege(
    token: string,
    f: TerminFormular,
  ): Promise<Result<{ termin: Termin; hinweise: Hinweis[] }, Verweigert | Validierungsfehler[]>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const v = this.validiere(f, b);
    if (!v.ok) return v;
    const termin = await this.verwaltung.lege(v.value.termin, b);
    return ok({ termin, hinweise: v.value.hinweise });
  }

  /** Mehrere Veranstaltungen (z. B. ein ganzes Kirmeswochenende) in einem Schritt. */
  async legeMehrere(
    token: string,
    formulare: TerminFormular[],
  ): Promise<
    Result<{ termine: Termin[]; hinweise: Hinweis[] }, Verweigert | Validierungsfehler[]>
  > {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const v = validiereAlle(formulare, (f) => this.validiere(f, b));
    if (!v.ok) return v;
    return ok({
      termine: await this.verwaltung.legeAlle(v.value.termine, b),
      hinweise: v.value.hinweise,
    });
  }

  async aendere(
    token: string,
    id: string,
    f: TerminFormular,
  ): Promise<
    Result<{ hinweise: Hinweis[] }, Verweigert | Validierungsfehler[] | 'NICHT_GEFUNDEN'>
  > {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const v = this.validiere(f, b);
    if (!v.ok) return v;
    if (!UUID.test(id) || !(await this.verwaltung.aendere(id, v.value.termin, b))) {
      return err('NICHT_GEFUNDEN');
    }
    return ok({ hinweise: v.value.hinweise });
  }

  async bestaetige(token: string, id: string): Promise<Result<boolean, Verweigert>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    return ok(UUID.test(id) && (await this.verwaltung.bestaetige(id, b)));
  }

  async loesche(token: string, id: string): Promise<Result<boolean, Verweigert>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    return ok(UUID.test(id) && (await this.verwaltung.loesche(id, b)));
  }

  private validiere(f: TerminFormular, b: Berechtigung) {
    return validiereTermin({
      ortSlug: b.ortSlug,
      landkreis: b.landkreis,
      datum: f.datum,
      beginn: f.beginn || null,
      titel: f.titel,
      veranstaltungsort: f.veranstaltungsort ?? null,
      kategorie: f.kategorie || erkenneKategorie(f.titel),
      bestaetigt: true,
      band: f.band ?? null,
      info: f.info ?? null,
      muttizettel: f.muttizettel ?? false,
    });
  }
}
