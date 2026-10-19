import { istOrtSlug } from '../domain/termin.js';
import { parseDatum, plusTage, type KalenderDatum } from '../domain/datum.js';
import { err, ok, type Validierungsfehler } from '../domain/result.js';
import { ROLLEN, type Sitzungen } from './admin.js';
import type { TerminRepository, Uhr } from './ports.js';

/** Interne Herkunft; absichtlich nicht Bestandteil des öffentlichen Terminmodells. */
export interface TerminHerkunft {
  name: string | null;
  angelegtAm: string | null;
  weg: 'redaktion' | 'bearbeitungslink' | 'vorschlag' | 'unbekannt';
  /** Letzte Bearbeitung (Ändern/Bestätigen) laut Änderungsprotokoll – Issue #181 */
  geaendert?: { name: string | null; am: string; weg: 'redaktion' | 'bearbeitungslink' } | null;
}

export interface RedaktionsFilter {
  ort?: string;
  q?: string;
  datum?: string;
  /** Frühestes Datum (z. B. erster Tag einer gerade eingetragenen Kirmes); ersetzt den Zeitraum-Beginn. */
  von?: string;
  zeitraum?: string;
  limit?: number;
  offset?: number;
}
/** Eigene Redaktionssuche über den gesamten Bestand, mit verbindlicher Sitzung im Use Case. */
export class RedaktionsTermine {
  constructor(
    private readonly repo: TerminRepository,
    private readonly sitzungen: Sitzungen,
    private readonly uhr: Uhr,
  ) {}
  async liste(token: string, e: RedaktionsFilter) {
    const s = token ? await this.sitzungen.pruefe(token) : null;
    if (!s || !ROLLEN.includes(s.rolle)) return err('VERBOTEN' as const);
    // Kirmesgesellschaft sieht nur ihren Ort – egal was im Filter steht (Issue #180)
    if (s.rolle === 'kirmesgesellschaft') {
      if (!s.ortSlug) return err('VERBOTEN' as const);
      e = { ...e, ort: s.ortSlug };
    }
    const fehler: Validierungsfehler[] = [];
    const q = (e.q ?? '').replace(/\p{Cc}/gu, ' ').trim();
    const limit = e.limit ?? 25;
    const offset = e.offset ?? 0;
    const zeitraum = e.zeitraum ?? 'kommend';
    if (q.length > 100)
      fehler.push({ feld: 'q', code: 'LAENGE', meldung: 'Suche: höchstens 100 Zeichen.' });
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1_000_000
    )
      fehler.push({ feld: 'seite', code: 'SEITE', meldung: 'Ungültige Seite.' });
    if (!['kommend', 'vergangen', 'alle'].includes(zeitraum))
      fehler.push({
        feld: 'zeitraum',
        code: 'ZEITRAUM',
        meldung: 'Bitte kommende, vergangene oder alle Termine wählen.',
      });
    if (e.ort && !istOrtSlug(e.ort))
      fehler.push({ feld: 'ort', code: 'ORT', meldung: 'Ungültiger Ort.' });
    const datum = e.datum ? parseDatum(e.datum) : null;
    if (datum && !datum.ok) fehler.push(datum.error);
    const von = e.von ? parseDatum(e.von) : null;
    if (von && !von.ok) fehler.push(von.error);
    if (fehler.length) return err(fehler);
    const heute = this.uhr.heute();
    const filter = {
      bereich: {
        von: datum?.ok
          ? datum.value
          : von?.ok
            ? von.value
            : zeitraum === 'kommend'
              ? heute
              : ('0100-01-01' as KalenderDatum),
        bis: datum?.ok
          ? datum.value
          : zeitraum === 'vergangen'
            ? plusTage(heute, -1)
            : ('9999-12-31' as KalenderDatum),
      },
      landkreise: [],
      kategorien: [],
      suchtext: q || null,
      ortSlug: e.ort || null,
      nurBestaetigt: false,
      limit,
      offset,
    };
    const seite = await this.repo.suche(filter);
    // PostgreSQL count(*) OVER() hat bei einer leeren Folgeseite keine Ergebniszeile.
    if (offset > 0 && !seite.eintraege.length)
      seite.gesamt = (await this.repo.suche({ ...filter, limit: 1, offset: 0 })).gesamt;
    return ok(seite);
  }
}
