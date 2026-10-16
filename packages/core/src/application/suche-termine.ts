import { erstelleDatumsbereich, parseDatum, plusTage } from '../domain/datum.js';
import { parseLandkreis, type LandkreisKuerzel } from '../domain/landkreis.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import { istOrtSlug, kategorieAus, type Kategorie, type Termin } from '../domain/termin.js';
import type { Seite, TerminFilter, TerminRepository, Uhr } from './ports.js';

/** Rohe Anfrage, wie sie von außen (HTTP, CLI) kommt. */
export interface SucheAnfrage {
  von?: string;
  bis?: string;
  landkreise?: string[];
  kategorien?: string[];
  q?: string;
  ort?: string;
  nurBestaetigt?: boolean;
  limit?: number;
  offset?: number;
}

export const STANDARD_ZEITRAUM_TAGE = 365;
export const MAX_LIMIT = 200;
const SUCHTEXT_MAX = 100;

export function baueFilter(a: SucheAnfrage, uhr: Uhr): Result<TerminFilter, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];

  const von = a.von ? parseDatum(a.von, 'von') : ok(uhr.heute());
  if (!von.ok) fehler.push(von.error);
  const bis = a.bis
    ? parseDatum(a.bis, 'bis')
    : ok(plusTage(von.ok ? von.value : uhr.heute(), STANDARD_ZEITRAUM_TAGE));
  if (!bis.ok) fehler.push(bis.error);
  const bereich = von.ok && bis.ok ? erstelleDatumsbereich(von.value, bis.value) : null;
  if (bereich && !bereich.ok) fehler.push(bereich.error);

  const landkreise: LandkreisKuerzel[] = [];
  for (const k of a.landkreise ?? []) {
    const r = parseLandkreis(k);
    if (r.ok) landkreise.push(r.value);
    else fehler.push(r.error);
  }

  const kategorien: Kategorie[] = [];
  for (const roh of a.kategorien ?? []) {
    // Auch frühere Bezeichnungen aus alten Links (?kategorie=kinder) verstehen
    const k = kategorieAus(roh);
    if (!k) {
      fehler.push({
        feld: 'kategorien',
        code: 'KATEGORIE_UNBEKANNT',
        meldung: `Unbekannt: ${roh}`,
      });
    } else if (!kategorien.includes(k)) kategorien.push(k);
  }

  const q = a.q?.trim() || null;
  if (q && q.length > SUCHTEXT_MAX) {
    fehler.push({ feld: 'q', code: 'SUCHE_ZU_LANG', meldung: `Max. ${SUCHTEXT_MAX} Zeichen.` });
  }

  const ortSlug = a.ort?.trim() || null;
  if (ortSlug && !istOrtSlug(ortSlug)) {
    fehler.push({ feld: 'ort', code: 'SLUG_UNGUELTIG', meldung: 'Ungültiger Orts-Slug.' });
  }

  const limit = a.limit ?? 50;
  const offset = a.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    fehler.push({ feld: 'limit', code: 'LIMIT_UNGUELTIG', meldung: `1–${MAX_LIMIT}.` });
  }
  if (!Number.isInteger(offset) || offset < 0) {
    fehler.push({ feld: 'offset', code: 'OFFSET_UNGUELTIG', meldung: '≥ 0.' });
  }

  if (fehler.length || !bereich?.ok) return err(fehler);
  return ok({
    bereich: bereich.value,
    landkreise,
    kategorien,
    suchtext: q,
    ortSlug,
    nurBestaetigt: a.nurBestaetigt ?? false,
    limit,
    offset,
  });
}

/** Use Case: Kirmestermine suchen und filtern. */
export class SucheTermine {
  constructor(
    private readonly repo: TerminRepository,
    private readonly uhr: Uhr,
  ) {}

  async ausfuehren(a: SucheAnfrage): Promise<Result<Seite<Termin>, Validierungsfehler[]>> {
    const filter = baueFilter(a, this.uhr);
    if (!filter.ok) return filter;
    return ok(await this.repo.suche(filter.value));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Use Case: einzelnen Termin laden (teilbare Terminseite). Ungültige IDs gehen nicht zur DB. */
export class FindeTermin {
  constructor(private readonly repo: TerminRepository) {}

  ausfuehren(id: string): Promise<Termin | null> {
    return UUID.test(id) ? this.repo.finde(id) : Promise.resolve(null);
  }
}
