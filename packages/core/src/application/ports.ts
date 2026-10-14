import type { Datumsbereich, KalenderDatum } from '../domain/datum.js';
import type { LandkreisKuerzel } from '../domain/landkreis.js';
import type { Kategorie, NeuerTermin, Termin } from '../domain/termin.js';

/** Abfrage-Kriterien – bereits validiert, frei von SQL/HTTP-Details. */
export interface TerminFilter {
  bereich: Datumsbereich;
  landkreise: readonly LandkreisKuerzel[];
  kategorien: readonly Kategorie[];
  suchtext: string | null;
  nurBestaetigt: boolean;
  limit: number;
  offset: number;
}

export interface Seite<T> {
  eintraege: T[];
  gesamt: number;
}

/** Driven Port: wird in der Infrastruktur (PostgreSQL) implementiert. */
export interface TerminRepository {
  suche(filter: TerminFilter): Promise<Seite<Termin>>;
  speichere(termin: NeuerTermin): Promise<Termin>;
}

/** Ermöglicht deterministische Tests ohne echte Uhr. */
export interface Uhr {
  heute(): KalenderDatum;
}

/** Technischer Fehler der Persistenz (z. B. DB nicht erreichbar) – Domäne kennt keinen Treiber. */
export class PersistenzNichtVerfuegbar extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Persistenz nicht verfügbar', options);
    this.name = 'PersistenzNichtVerfuegbar';
  }
}
