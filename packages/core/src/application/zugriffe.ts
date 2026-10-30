/**
 * Zugriffszahlen ohne Tracking (Issue #311): Die Website zählt Seitenaufrufe je Pfad und meldet nur
 * Summen. Es gibt keine Person, keine IP, keine Kennung – nur „Pfad X wurde heute N-mal aufgerufen“.
 * Ansehen dürfen sie nur Admins.
 */
import { err, ok, type Result } from '../domain/result.js';
import type { Sitzung } from './admin.js';
import { darf } from './rechte.js';

export const ZUGRIFFE_AUFBEWAHRUNG_TAGE = 400;
export const ZUGRIFFE_MAX_EINTRAEGE = 2000;
const PFAD = /^\/[\p{L}\p{N}/._~-]{0,199}$/u;

export interface Aufruf {
  pfad: string;
  anzahl: number;
}
export interface Zugriffsstatistik {
  tage: { tag: string; anzahl: number }[];
  seiten: Aufruf[];
}
export interface ZugriffsAblage {
  erfasse(aufrufe: Aufruf[]): Promise<void>;
  statistik(tage: number): Promise<Zugriffsstatistik>;
  raeumeAuf(tage: number): Promise<void>;
}

export class Zugriffe {
  constructor(private readonly ablage: ZugriffsAblage) {}

  /** Von der Website gemeldete Summen; Ungültiges fällt still weg. */
  async erfasse(aufrufe: Aufruf[]): Promise<number> {
    const gueltig = aufrufe
      .slice(0, ZUGRIFFE_MAX_EINTRAEGE)
      .filter((a) => PFAD.test(a.pfad) && Number.isInteger(a.anzahl) && a.anzahl > 0);
    if (gueltig.length) await this.ablage.erfasse(gueltig);
    return gueltig.length;
  }

  async statistik(akteur: Sitzung, tage = 30): Promise<Result<Zugriffsstatistik, 'NUR_ADMIN'>> {
    if (!darf(akteur, 'statistik')) return err('NUR_ADMIN');
    return ok(await this.ablage.statistik(Math.min(Math.max(Math.trunc(tage) || 30, 1), 400)));
  }
}
