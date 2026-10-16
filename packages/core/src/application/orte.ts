import { parseKartenausschnitt } from '../domain/festplatz.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
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

  /** Orte in einem Kartenausschnitt („minLon,minLat,maxLon,maxLat“) – für die Kartenansicht. */
  async imAusschnitt(bbox: string): Promise<Result<OrtUebersicht[], Validierungsfehler[]>> {
    const a = parseKartenausschnitt(bbox);
    if (!a.ok) return err([a.error]);
    return ok(await this.repo.liste(this.uhr.heute(), a.value));
  }
}

/** Use Case: einen Ort anhand seines Slugs finden. Ungültige Slugs gehen nicht bis zur Datenbank. */
export class FindeOrt {
  constructor(private readonly repo: OrtRepository) {}

  async ausfuehren(slug: string): Promise<Ort | null> {
    return istOrtSlug(slug) ? this.repo.finde(slug) : null;
  }
}
