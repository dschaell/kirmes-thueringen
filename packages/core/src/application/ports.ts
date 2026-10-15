import type { Kartenausschnitt } from '../domain/festplatz.js';
import type { Datumsbereich, KalenderDatum } from '../domain/datum.js';
import type { LandkreisKuerzel } from '../domain/landkreis.js';
import type { Kategorie, NeuerTermin, Ort, Termin } from '../domain/termin.js';

/** Abfrage-Kriterien – bereits validiert, frei von SQL/HTTP-Details. */
export interface TerminFilter {
  bereich: Datumsbereich;
  landkreise: readonly LandkreisKuerzel[];
  kategorien: readonly Kategorie[];
  suchtext: string | null;
  /** null = alle Orte */
  ortSlug: string | null;
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
  finde(id: string): Promise<Termin | null>;
  speichere(termin: NeuerTermin): Promise<Termin>;
}

/** Ort mit Terminanzahl – für Übersichten (Orte A–Z, Landkreise). */
export interface OrtUebersicht {
  ort: Ort;
  /** Termine ab heute */
  anzahlKommend: number;
}

/** Driven Port: Orte lesen. */
export interface OrtRepository {
  /** @param ausschnitt nur Orte in diesem Kartenausschnitt (null = alle) */
  liste(ab: KalenderDatum, ausschnitt?: Kartenausschnitt | null): Promise<OrtUebersicht[]>;
  finde(slug: string): Promise<Ort | null>;
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
