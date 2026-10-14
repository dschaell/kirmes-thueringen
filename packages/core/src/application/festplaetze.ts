import { validiereFestplatz, type Festplatz } from '../domain/festplatz.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import type { Ort } from '../domain/termin.js';

/** Wer darf bearbeiten? Ergebnis einer erfolgreichen Link-Prüfung – gilt immer nur für einen Ort. */
export interface Berechtigung {
  readonly linkId: string;
  readonly ortSlug: string;
  readonly bezeichnung: string;
}

/** Driven Port: prüft einen Bearbeitungslink (Hashing/Speicherung liegt in der Infrastruktur). */
export interface Bearbeitungslinks {
  pruefe(token: string): Promise<Berechtigung | null>;
}

export interface FestplatzUebersicht {
  ort: Ort;
  festplaetze: Festplatz[];
  /** Veranstaltungsorte aus den Terminen, für die noch ein Pin gesetzt werden kann */
  veranstaltungsorte: string[];
}

/** Driven Port: Festplätze lesen und schreiben (Schreiben inkl. Protokolleintrag). */
export interface FestplatzRepository {
  uebersicht(ortSlug: string): Promise<FestplatzUebersicht | null>;
  speichere(ortSlug: string, festplatz: Festplatz, durch: Berechtigung): Promise<void>;
  loesche(ortSlug: string, name: string, durch: Berechtigung): Promise<boolean>;
}

export type Verweigert = { code: 'NICHT_BERECHTIGT' };
const VERWEIGERT: Verweigert = { code: 'NICHT_BERECHTIGT' };

/**
 * Use Cases der Kirmesgesellschaft. Jede Aktion beginnt mit der Link-Prüfung;
 * ein Link berechtigt ausschließlich für seinen eigenen Ort.
 */
export class VerwalteFestplaetze {
  constructor(
    private readonly links: Bearbeitungslinks,
    private readonly repo: FestplatzRepository,
  ) {}

  async uebersicht(
    token: string,
  ): Promise<Result<FestplatzUebersicht & { bezeichnung: string }, Verweigert>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const u = await this.repo.uebersicht(b.ortSlug);
    return u ? ok({ ...u, bezeichnung: b.bezeichnung }) : err(VERWEIGERT);
  }

  async speichere(
    token: string,
    e: { name: string; lat: unknown; lon: unknown },
  ): Promise<Result<Festplatz, Verweigert | Validierungsfehler[]>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    const v = validiereFestplatz(e);
    if (!v.ok) return v;
    await this.repo.speichere(b.ortSlug, v.value, b);
    return ok(v.value);
  }

  async loesche(token: string, name: string): Promise<Result<boolean, Verweigert>> {
    const b = await this.links.pruefe(token);
    if (!b) return err(VERWEIGERT);
    return ok(await this.repo.loesche(b.ortSlug, name.trim(), b));
  }
}
