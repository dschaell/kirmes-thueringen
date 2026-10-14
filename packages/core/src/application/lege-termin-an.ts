import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import {
  validiereTermin,
  type Hinweis,
  type Termin,
  type TerminEingabe,
} from '../domain/termin.js';
import type { TerminRepository } from './ports.js';

/** Use Case: Termin anlegen (Verwaltung). Autorisierung erfolgt im Interface-Adapter. */
export class LegeTerminAn {
  constructor(private readonly repo: TerminRepository) {}

  async ausfuehren(
    e: TerminEingabe,
  ): Promise<Result<{ termin: Termin; hinweise: Hinweis[] }, Validierungsfehler[]>> {
    const v = validiereTermin(e);
    if (!v.ok) return err(v.error);
    const termin = await this.repo.speichere(v.value.termin);
    return ok({ termin, hinweise: v.value.hinweise });
  }
}
