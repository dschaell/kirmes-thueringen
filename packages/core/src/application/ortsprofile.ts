/** Vereinsprofil pflegen (Issue #310): Kirmesgesellschaft am eigenen Ort, Redaktion überall. */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import {
  validiereOrtsprofil,
  type Ortsprofil,
  type OrtsprofilEingabe,
} from '../domain/ortsprofil.js';
import type { Sitzung } from './admin.js';
import { darf } from './rechte.js';

export interface OrtsprofilAblage {
  /** false = Ort unbekannt */
  setze(ortSlug: string, profil: Ortsprofil, adminId: string): Promise<boolean>;
}

export type OrtsprofilFehler = 'NUR_ADMIN' | 'NICHT_GEFUNDEN' | Validierungsfehler[];

export class Ortsprofile {
  constructor(private readonly ablage: OrtsprofilAblage) {}

  async setze(
    akteur: Sitzung,
    ortSlug: string,
    eingabe: OrtsprofilEingabe,
  ): Promise<Result<Ortsprofil, OrtsprofilFehler>> {
    if (!darf(akteur, 'termine', ortSlug)) return err('NUR_ADMIN');
    const p = validiereOrtsprofil(eingabe);
    if (!p.ok) return p;
    return (await this.ablage.setze(ortSlug, p.value, akteur.adminId))
      ? ok(p.value)
      : err('NICHT_GEFUNDEN');
  }
}
