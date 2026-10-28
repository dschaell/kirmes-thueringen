/**
 * Redaktionszugang: Sitzung, Rollen und alle Redaktionsaufgaben. Angemeldet wird nur mit Passkey.
 * Speicherung und Zufall liegen hinter Ports – der Core kennt weder WebAuthn noch Cookies.
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import {
  validiereMitteilung,
  validiereOrt,
  type Mitteilung,
  type MitteilungEingabe,
  type NeueMitteilung,
  type NeuerOrt,
  type OrtEingabe,
} from '../domain/redaktion.js';
import { validiereSpeisen, type Speise } from '../domain/speisen.js';
import {
  validiereTermin,
  type Hinweis,
  type NeuerTermin,
  type Ort,
  type Termin,
} from '../domain/termin.js';
import type { Berechtigung } from './festplaetze.js';
import { erkenneKategorie } from './recherche.js';
import { validiereAlle, type TerminFormular, type TerminVerwaltung } from './termine-verwalten.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
/**
 * Admin verwaltet zusätzlich die Mitglieder; Redaktion pflegt alles (Moderation); eine
 * Kirmesgesellschaft nur Termine, Plätze, Vorschläge und Korrekturen ihres einen Ortes (Issue #180).
 */
export type Rolle = 'admin' | 'redaktion' | 'kirmesgesellschaft';
export const ROLLEN: readonly Rolle[] = ['admin', 'redaktion', 'kirmesgesellschaft'];
/** Angemeldetes Mitglied – ohne personenbezogene Daten außer dem selbst gewählten Namen. */
export interface Sitzung {
  adminId: string;
  name: string;
  rolle: Rolle;
  /** Nur bei Kirmesgesellschaften: ihr Ort */
  ortSlug?: string | null;
  ortName?: string | null;
  /** Eigener Name der Kirmesgesellschaft (Issue #246), sonst null */
  kgName?: string | null;
}

export interface AdminKonten {
  merkeLogin(id: string): Promise<void>;
}
/** Zufall für Sitzungen und Links – Implementierung in der Infrastruktur. */
export interface Kryptografie {
  neuesToken(): string;
}
export interface Sitzungen {
  lege(adminId: string, token: string, stunden: number): Promise<void>;
  pruefe(token: string): Promise<Sitzung | null>;
  beende(token: string): Promise<void>;
}
/** Zählt Fehlversuche gegen das Durchprobieren. */
export interface Anmeldeversuche {
  gesperrt(schluessel: string): boolean;
  fehlschlag(schluessel: string): void;
  erfolg(schluessel: string): void;
}
export interface MitteilungRepository {
  liste(): Promise<Mitteilung[]>;
  aktuelle(): Promise<Mitteilung | null>;
  lege(m: NeueMitteilung, adminId: string): Promise<Mitteilung>;
  /** Titel, Text, Link ändern (Issue #261) – null, wenn es sie nicht gibt */
  aendere(id: string, m: NeueMitteilung): Promise<Mitteilung | null>;
  setzeVeroeffentlicht(id: string, an: boolean): Promise<boolean>;
  loesche(id: string): Promise<boolean>;
}
/** Von der Redaktion angelegter Ort – löschbar, solange nichts daran hängt (Issue #159). */
export interface EigenerOrt {
  slug: string;
  name: string;
  landkreis: string;
  termine: number;
  vorschlaege: number;
}
export type OrtLoeschen = 'geloescht' | 'unbekannt' | 'ortsverzeichnis' | 'belegt';
export type OrtAendern = 'geaendert' | 'unbekannt' | 'ortsverzeichnis';
export interface OrtVerwaltung {
  /** null, wenn der Slug schon vergeben ist */
  lege(o: NeuerOrt, adminId: string): Promise<Ort | null>;
  eigene(): Promise<EigenerOrt[]>;
  /** Nur selbst angelegte Orte ohne Termine und Vorschläge; protokolliert. */
  loesche(slug: string, adminId: string): Promise<OrtLoeschen>;
  /** Name und Landkreis – nur selbst angelegte Orte; die Adresse (Slug) bleibt; protokolliert. */
  aendere(
    slug: string,
    o: { name: string; landkreis: string },
    adminId: string,
  ): Promise<OrtAendern>;
}
export interface LinkInfo {
  id: string;
  ortSlug: string;
  ortName: string;
  bezeichnung: string;
  erstelltAm: string;
  zuletztGenutzt: string | null;
  gesperrtAm: string | null;
}
export interface LinkVerwaltung {
  erstelle(ortSlug: string, bezeichnung: string, token: string): Promise<LinkInfo | null>;
  liste(): Promise<LinkInfo[]>;
  sperre(id: string): Promise<boolean>;
}

// ── Sitzung ────────────────────────────────────────────────────────────────────────────
/** Angemeldet wird nur mit Passkey (siehe passkeys.ts); hier wird die Sitzung geprüft/beendet. */
export const SITZUNG_STUNDEN = 12;

export class AdminAnmeldung {
  constructor(private readonly sitzungen: Sitzungen) {}

  pruefe(token: string): Promise<Sitzung | null> {
    return token ? this.sitzungen.pruefe(token) : Promise.resolve(null);
  }

  abmelden(token: string) {
    return this.sitzungen.beende(token);
  }
}

// ── Redaktionsaufgaben ──────────────────────────────────────────────────────────────────
export interface AdminTerminFormular extends TerminFormular {
  ortSlug: string;
  bestaetigt?: boolean;
}

/** Alle Redaktionsaufgaben. Aufrufer müssen vorher eine gültige Sitzung geprüft haben (adminId). */
export class Redaktion {
  constructor(
    private readonly mitteilungen: MitteilungRepository,
    private readonly orte: OrtVerwaltung,
    private readonly ortLandkreis: (slug: string) => Promise<string | null>,
    private readonly termine: TerminVerwaltung,
    private readonly links: LinkVerwaltung,
    private readonly krypto: Pick<Kryptografie, 'neuesToken'>,
  ) {}

  // Mitteilungen
  listeMitteilungen() {
    return this.mitteilungen.liste();
  }
  async legeMitteilung(
    e: MitteilungEingabe,
    adminId: string,
  ): Promise<Result<Mitteilung, Validierungsfehler[]>> {
    const v = validiereMitteilung(e);
    return v.ok ? ok(await this.mitteilungen.lege(v.value, adminId)) : v;
  }
  /** Bearbeiten (Issue #261): gleiche Regeln wie beim Anlegen; ok(null) = gibt es nicht. */
  async aendereMitteilung(
    id: string,
    e: MitteilungEingabe,
  ): Promise<Result<Mitteilung | null, Validierungsfehler[]>> {
    const v = validiereMitteilung(e);
    return v.ok ? ok(await this.mitteilungen.aendere(id, v.value)) : v;
  }
  veroeffentliche(id: string, an: boolean) {
    return this.mitteilungen.setzeVeroeffentlicht(id, an);
  }
  loescheMitteilung(id: string) {
    return this.mitteilungen.loesche(id);
  }

  // Orte
  async legeOrt(e: OrtEingabe, adminId: string): Promise<Result<Ort, Validierungsfehler[]>> {
    const v = validiereOrt(e);
    if (!v.ok) return v;
    const ort = await this.orte.lege(v.value, adminId);
    return ort
      ? ok(ort)
      : err([
          {
            feld: 'name',
            code: 'ORT_VORHANDEN',
            meldung: `Einen Ort mit der Adresse /orte/${v.value.slug} gibt es schon.`,
          },
        ]);
  }

  eigeneOrte() {
    return this.orte.eigene();
  }
  loescheOrt(slug: string, adminId: string) {
    return this.orte.loesche(slug, adminId);
  }

  /**
   * Name/Landkreis eines selbst angelegten Ortes korrigieren (Issue #216). Orte aus dem
   * Ortsverzeichnis (OpenStreetMap) bleiben, wie sie sind. Die Adresse /orte/<slug> ändert sich nicht.
   */
  async aendereOrt(
    slug: string,
    e: { name: string; landkreis: string },
    adminId: string,
  ): Promise<Result<true, Validierungsfehler[]>> {
    const v = validiereOrt(e);
    if (!v.ok) return v;
    const r = await this.orte.aendere(
      slug,
      { name: v.value.name, landkreis: v.value.landkreis },
      adminId,
    );
    if (r === 'geaendert') return ok(true);
    return err([
      r === 'ortsverzeichnis'
        ? {
            feld: 'name',
            code: 'ORTSVERZEICHNIS',
            meldung: 'Orte aus dem Ortsverzeichnis behalten ihren Namen und Landkreis.',
          }
        : { feld: 'name', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' },
    ]);
  }

  // Termine für jeden Ort
  async legeTermin(
    f: AdminTerminFormular,
    adminId: string,
  ): Promise<Result<{ termin: Termin; hinweise: Hinweis[] }, Validierungsfehler[]>> {
    const b = await this.berechtigungFuer(f.ortSlug, adminId);
    if (!b)
      return err([{ feld: 'ortSlug', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' }]);
    const v = this.validiere(f, b);
    if (!v.ok) return v;
    return ok({ termin: await this.termine.lege(v.value.termin, b), hinweise: v.value.hinweise });
  }

  /** Ganzes Kirmeswochenende: mehrere Veranstaltungen eines Ortes in einer Transaktion. */
  async legeWochenende(
    ortSlug: string,
    zeilen: Omit<AdminTerminFormular, 'ortSlug'>[],
    adminId: string,
  ): Promise<Result<{ termine: Termin[]; hinweise: Hinweis[] }, Validierungsfehler[]>> {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    if (!b)
      return err([{ feld: 'ortSlug', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' }]);
    const v = validiereAlle(zeilen, (z) => this.validiere({ ...z, ortSlug }, b));
    if (!v.ok) return v;
    return ok({
      termine: await this.termine.legeAlle(v.value.termine, b),
      hinweise: v.value.hinweise,
    });
  }

  /**
   * Ganze Kirmes eines Ortes auf einmal bearbeiten (Issue #65): jede Zeile mit ID, ändern oder
   * löschen. Alles wird geprüft und in einer Transaktion gespeichert – oder gar nichts.
   */
  async bearbeiteKirmes(
    ortSlug: string,
    zeilen: (Omit<AdminTerminFormular, 'ortSlug'> & { id: string; loeschen?: boolean })[],
    adminId: string,
  ): Promise<Result<{ hinweise: Hinweis[] }, Validierungsfehler[] | 'NICHT_GEFUNDEN'>> {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    if (!b) return err('NICHT_GEFUNDEN');
    const bleiben = zeilen.filter((z) => !z.loeschen);
    // Nur löschen ist erlaubt – dann gibt es nichts zu prüfen
    const v = bleiben.length
      ? validiereAlle(bleiben, (z) => this.validiere({ ...z, ortSlug }, b))
      : ok({ termine: [], hinweise: [] });
    if (!v.ok) return v;
    const gespeichert = await this.termine.aendereAlle(
      // validiereAlle liefert die Termine in derselben Reihenfolge wie die Zeilen
      bleiben.map((z, i) => ({ id: z.id, termin: v.value.termine[i] as NeuerTermin })),
      zeilen.filter((z) => z.loeschen).map((z) => z.id),
      b,
      Object.fromEntries(zeilen.map((z) => [z.id, z.version ?? ''])),
    );
    return gespeichert ? ok({ hinweise: v.value.hinweise }) : err('NICHT_GEFUNDEN');
  }

  /** Mittagstisch eines Termins setzen (Issue #66) – ersetzt die bisherigen Gerichte. */
  async setzeSpeisen(
    id: string,
    ortSlug: string,
    zeilen: readonly { name: string; preis: string }[],
    adminId: string,
    version?: string,
  ): Promise<Result<Speise[], Validierungsfehler[] | 'NICHT_GEFUNDEN'>> {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    if (!b) return err('NICHT_GEFUNDEN');
    const v = validiereSpeisen(zeilen);
    if (!v.ok) return v;
    return (await this.termine.setzeSpeisen(id, v.value, b, version)) ? v : err('NICHT_GEFUNDEN');
  }

  async aendereTermin(
    id: string,
    f: AdminTerminFormular,
    adminId: string,
  ): Promise<Result<{ hinweise: Hinweis[] }, Validierungsfehler[] | 'NICHT_GEFUNDEN'>> {
    const b = await this.berechtigungFuer(f.ortSlug, adminId);
    if (!b) return err('NICHT_GEFUNDEN');
    const v = this.validiere(f, b);
    if (!v.ok) return v;
    return (await this.termine.aendere(id, v.value.termin, b))
      ? ok({ hinweise: v.value.hinweise })
      : err('NICHT_GEFUNDEN');
  }

  async bestaetigeTermin(id: string, ortSlug: string, adminId: string, version?: string) {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    return b ? this.termine.bestaetige(id, b, version) : false;
  }

  async loescheTermin(id: string, ortSlug: string, adminId: string, version?: string) {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    return b ? this.termine.loesche(id, b, version) : false;
  }

  // Bearbeitungslinks
  listeLinks() {
    return this.links.liste();
  }
  async erstelleLink(
    ortSlug: string,
    bezeichnung: string,
  ): Promise<Result<{ link: LinkInfo; token: string }, Validierungsfehler[]>> {
    const b = bezeichnung.trim();
    if (!b || b.length > 200) {
      return err([
        { feld: 'bezeichnung', code: 'BEZEICHNUNG_LAENGE', meldung: 'Bezeichnung: 1–200 Zeichen.' },
      ]);
    }
    const token = this.krypto.neuesToken();
    const link = await this.links.erstelle(ortSlug, b, token);
    return link
      ? ok({ link, token })
      : err([{ feld: 'ortSlug', code: 'ORT_UNBEKANNT', meldung: 'Ort nicht gefunden.' }]);
  }
  sperreLink(id: string) {
    return this.links.sperre(id);
  }

  private async berechtigungFuer(ortSlug: string, adminId: string): Promise<Berechtigung | null> {
    const landkreis = await this.ortLandkreis(ortSlug);
    return landkreis
      ? { linkId: null, adminId, ortSlug, landkreis, bezeichnung: 'Redaktion' }
      : null;
  }

  private validiere(f: AdminTerminFormular, b: Berechtigung) {
    const speisen = validiereSpeisen(f.speisen ?? []);
    if (!speisen.ok) return speisen;
    const v = validiereTermin({
      ortSlug: b.ortSlug,
      landkreis: b.landkreis,
      datum: f.datum,
      beginn: f.beginn || null,
      titel: f.titel,
      veranstaltungsort: f.veranstaltungsort ?? null,
      kategorie: f.kategorie || erkenneKategorie(f.titel),
      bestaetigt: f.bestaetigt ?? false,
      band: f.band ?? null,
      pfarrer: f.pfarrer,
      veranstalter: f.veranstalter,
      ende: f.ende,
      eintritt: f.eintritt,
      info: f.info ?? null,
      muttizettel: f.muttizettel ?? false,
    });
    return v.ok
      ? ok({
          ...v.value,
          termin: {
            ...v.value.termin,
            version: f.version,
            ...(f.speisen ? { speisen: speisen.value } : {}),
          },
        })
      : v;
  }
}
