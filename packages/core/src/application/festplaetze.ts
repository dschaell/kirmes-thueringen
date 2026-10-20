import { validiereFestplatz, type Festplatz, type Koordinate } from '../domain/festplatz.js';
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
  /**
   * Alle Plätze des Ortes auf einen Blick (Issue #216): Festplätze und „Wo genau?“ der Termine,
   * je Platz die Zahl der Termine und – falls vorhanden – der Kartenpunkt.
   */
  plaetze: PlatzZeile[];
  /** Von der Redaktion angelegt (Name/Landkreis änderbar) – sonst aus dem Ortsverzeichnis */
  eigenerOrt: boolean;
}

export interface PlatzZeile {
  /** '' = Hauptfestplatz des Ortes */
  name: string;
  termine: number;
  koordinate: Koordinate | null;
}

/** Ergebnis einer Umbenennung: unbekannt = Name gibt es im Ort nicht; konflikt = beide haben einen Kartenpunkt */
export type Umbenennung = 'umbenannt' | 'unbekannt' | 'konflikt';

/** Driven Port: Festplätze lesen und schreiben (Schreiben inkl. Protokolleintrag). */
export interface FestplatzRepository {
  uebersicht(ortSlug: string): Promise<FestplatzUebersicht | null>;
  speichere(ortSlug: string, festplatz: Festplatz, durch: Berechtigung): Promise<void>;
  loesche(ortSlug: string, name: string, durch: Berechtigung): Promise<boolean>;
  /** Termine („Wo genau?“) und Festplatz gemeinsam umbenennen – in einer Transaktion, protokolliert. */
  benenneUm(ortSlug: string, alt: string, neu: string, durch: Berechtigung): Promise<Umbenennung>;
  /** Ortsmitte (Ziel der Route ohne eigenen Platz) setzen; false = Ort unbekannt. */
  setzeOrtsmitte(ortSlug: string, k: Koordinate, durch: Berechtigung): Promise<boolean>;
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

  /**
   * Platz umbenennen (Issue #216): alle Termine mit diesem „Wo genau?“ und der Kartenpunkt ziehen
   * mit, damit die Route erhalten bleibt. Gibt es den neuen Namen schon MIT Kartenpunkt und hat
   * auch der alte einen, wird abgelehnt (sonst ginge ein Kartenpunkt verloren).
   */
  async benenneUm(
    ortSlug: string,
    alt: string,
    neu: string,
    adminId: string,
  ): Promise<Result<true, Validierungsfehler[]>> {
    const von = alt.trim();
    const nach = neu.trim().replace(/\s+/g, ' ');
    if (!nach || nach.length > 120)
      return err([{ feld: 'neu', code: 'NAME_LAENGE', meldung: 'Neuer Name: 1–120 Zeichen.' }]);
    if (nach === von)
      return err([
        { feld: 'neu', code: 'GLEICH', meldung: 'Der neue Name ist derselbe wie vorher.' },
      ]);
    const b = await this.berechtigung(ortSlug, adminId);
    const e = b ? await this.repo.benenneUm(ortSlug, von, nach, b) : 'unbekannt';
    if (e === 'umbenannt') return ok(true);
    return err([
      e === 'konflikt'
        ? {
            feld: 'neu',
            code: 'PLATZ_VORHANDEN',
            meldung: `„${nach}“ hat schon einen eigenen Kartenpunkt. Erst einen der beiden Kartenpunkte löschen, dann umbenennen.`,
          }
        : {
            feld: 'alt',
            code: 'PLATZ_UNBEKANNT',
            meldung: `„${von}“ gibt es in diesem Ort nicht (mehr).`,
          },
    ]);
  }

  /** Ortsmitte per Google-Maps-Link oder Koordinaten setzen (Issue #216). */
  async setzeOrtsmitte(
    ortSlug: string,
    standort: string,
    adminId: string,
  ): Promise<Result<Koordinate, Validierungsfehler[]>> {
    const b = await this.berechtigung(ortSlug, adminId);
    if (!b)
      return err([{ feld: 'ortSlug', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' }]);
    const roh = standort.trim();
    const text = istKartenKurzlink(roh) ? ((await this.links.aufloesen(roh)) ?? '') : roh;
    const k = koordinateAusText(text);
    const v = k ? validiereFestplatz({ name: '', lat: k.lat, lon: k.lon }) : null;
    if (!v?.ok)
      return err([
        {
          feld: 'standort',
          code: 'STANDORT',
          meldung:
            'Standort nicht erkannt – in Google Maps die Ortsmitte (z. B. Kirche oder Dorfplatz) antippen, „Teilen → Link kopieren“ und hier einfügen (oder Koordinaten wie 50.8475, 11.0412).',
        },
      ]);
    await this.repo.setzeOrtsmitte(ortSlug, v.value.koordinate, b);
    return ok(v.value.koordinate);
  }
}
