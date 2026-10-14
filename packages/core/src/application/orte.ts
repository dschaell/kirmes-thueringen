import { istOrtSlug, type Ort } from '../domain/termin.js';
import type { OrtRepository, OrtUebersicht, Uhr } from './ports.js';

/** Use Case: alle Kirmesorte mit Anzahl kommender Termine (Orte A–Z, Landkreis-Übersichten). */
export class ListeOrte {
  constructor(
    private readonly repo: OrtRepository,
    private readonly uhr: Uhr,
  ) {}

  ausfuehren(): Promise<OrtUebersicht[]> {
    return this.repo.liste(this.uhr.heute());
  }
}

/** Use Case: einen Ort anhand seines Slugs finden. Ungültige Slugs gehen nicht bis zur Datenbank. */
export class FindeOrt {
  constructor(private readonly repo: OrtRepository) {}

  async ausfuehren(slug: string): Promise<Ort | null> {
    return istOrtSlug(slug) ? this.repo.finde(slug) : null;
  }
}
