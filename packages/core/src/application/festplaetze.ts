import { validiereFestplatz, type Festplatz } from '../domain/festplatz.js';
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import { istKartenKurzlink, koordinateAusText, nameAusKartenlink } from '../domain/redaktion.js';
import type { Ort } from '../domain/termin.js';

/** Wer darf bearbeiten? Ergebnis einer erfolgreichen Link-Prüfung – gilt immer nur für einen Ort. */
export interface Berechtigung {
  /** Bearbeitungslink der Kirmesgesellschaft; null bei Änderungen der Redaktion */
  readonly linkId: string | null;
  /** gesetzt, wenn die Redaktion (Admin) handelt */
  readonly adminId?: string;
  readonly ortSlug: string;
  readonly landkreis: string;
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

// ── Plätze durch die Redaktion (Issue #62) ─────────────────────────────────────────────
/** Löst Kurzlinks von Google Maps auf (nur Google-Hosts). null = nicht auflösbar. */
export interface Kartenlinks {
  aufloesen(kurzlink: string): Promise<string | null>;
}

/**
 * Die Redaktion legt Plätze eines Ortes an (Kirche, Festzelt, Saal …) – per Google-Maps-Link oder
 * Koordinaten. Termine finden ihren Platz über den Veranstaltungsort (gleicher Name); ein Platz ohne
 * Namen ist der Hauptfestplatz des Ortes.
 */
export class RedaktionsFestplaetze {
  constructor(
    private readonly repo: FestplatzRepository,
    private readonly landkreis: (ortSlug: string) => Promise<string | null>,
    private readonly links: Kartenlinks,
  ) {}

  private async berechtigung(ortSlug: string, adminId: string): Promise<Berechtigung | null> {
    const lk = await this.landkreis(ortSlug);
    return lk ? { linkId: null, adminId, ortSlug, landkreis: lk, bezeichnung: 'Redaktion' } : null;
  }

  uebersicht(ortSlug: string) {
    return this.repo.uebersicht(ortSlug);
  }

  async speichere(
    ortSlug: string,
    e: { name: string; standort: string; nameNoetig?: boolean },
    adminId: string,
  ): Promise<Result<Festplatz, Validierungsfehler[]>> {
    const b = await this.berechtigung(ortSlug, adminId);
    if (!b)
      return err([{ feld: 'ortSlug', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' }]);
    const roh = e.standort.trim();
    const text = istKartenKurzlink(roh) ? ((await this.links.aufloesen(roh)) ?? '') : roh;
    const k = koordinateAusText(text);
    if (!k) {
      return err([
        {
          feld: 'standort',
          code: 'STANDORT',
          meldung:
            'Standort nicht erkannt – in Google Maps den Pin setzen, „Teilen → Link kopieren“ und hier einfügen (oder Koordinaten wie 50.8475, 11.0412).',
        },
      ]);
    }
    // Ohne eigenen Namen: Name aus dem (aufgelösten) Google-Maps-Link, sonst Hauptfestplatz (#165)
    const name = e.name.trim() || nameAusKartenlink(text) || '';
    if (!name && e.nameNoetig)
      return err([
        {
          feld: 'name',
          code: 'NAME_FEHLT',
          meldung:
            'Im Link steht kein Name (z. B. nur ein Punkt auf einem Feld) – bitte bei „Wo genau?“ einen Namen eintragen.',
        },
      ]);
    const v = validiereFestplatz({ name, lat: k.lat, lon: k.lon });
    if (!v.ok) return v;
    await this.repo.speichere(ortSlug, v.value, b);
    return ok(v.value);
  }

  async loesche(ortSlug: string, name: string, adminId: string): Promise<boolean> {
    const b = await this.berechtigung(ortSlug, adminId);
    return b ? this.repo.loesche(ortSlug, name.trim(), b) : false;
  }
}
