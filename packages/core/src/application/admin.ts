/**
 * Redaktionszugang (Admin): Anmeldung mit Passwort + Einmalcode und alle Redaktionsaufgaben.
 * Kryptografie, Speicherung und Zeit liegen hinter Ports – der Core kennt weder scrypt noch Cookies.
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
import { validiereTermin, type Hinweis, type Ort, type Termin } from '../domain/termin.js';
import type { Berechtigung } from './festplaetze.js';
import { erkenneKategorie } from './recherche.js';
import { validiereAlle, type TerminFormular, type TerminVerwaltung } from './termine-verwalten.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface AdminKonto {
  id: string;
  email: string;
  passwortHash: string;
  totpGeheimnis: string;
}
export interface AdminKonten {
  findeNachEmail(email: string): Promise<AdminKonto | null>;
  merkeLogin(id: string): Promise<void>;
}
/** Kryptografie (scrypt, TOTP, Zufall) – Implementierung in der Infrastruktur. */
export interface Kryptografie {
  pruefePasswort(passwort: string, hash: string): Promise<boolean>;
  pruefeEinmalcode(geheimnis: string, code: string): boolean;
  neuesToken(): string;
}
export interface Sitzungen {
  lege(adminId: string, token: string, stunden: number): Promise<void>;
  pruefe(token: string): Promise<{ adminId: string; email: string } | null>;
  beende(token: string): Promise<void>;
}
/** Zählt Fehlversuche (je E-Mail und insgesamt) gegen das Durchprobieren von Passwörtern. */
export interface Anmeldeversuche {
  gesperrt(email: string): boolean;
  fehlschlag(email: string): void;
  erfolg(email: string): void;
}
export interface MitteilungRepository {
  liste(): Promise<Mitteilung[]>;
  aktuelle(): Promise<Mitteilung | null>;
  lege(m: NeueMitteilung, adminId: string): Promise<Mitteilung>;
  setzeVeroeffentlicht(id: string, an: boolean): Promise<boolean>;
  loesche(id: string): Promise<boolean>;
}
export interface OrtVerwaltung {
  /** null, wenn der Slug schon vergeben ist */
  lege(o: NeuerOrt, adminId: string): Promise<Ort | null>;
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

// ── Anmeldung ───────────────────────────────────────────────────────────────────────────
export const SITZUNG_STUNDEN = 12;
export type AnmeldeFehler = 'UNGUELTIG' | 'GESPERRT';

export class AdminAnmeldung {
  constructor(
    private readonly konten: AdminKonten,
    private readonly krypto: Kryptografie,
    private readonly sitzungen: Sitzungen,
    private readonly versuche: Anmeldeversuche,
  ) {}

  /**
   * Gleiche Antwort für „unbekannte E-Mail“, „falsches Passwort“ und „falscher Code“,
   * damit niemand herausfinden kann, welche E-Mail ein Konto hat.
   */
  async anmelden(
    email: string,
    passwort: string,
    code: string,
  ): Promise<Result<{ token: string; stunden: number }, AnmeldeFehler>> {
    const e = email.trim().toLowerCase();
    if (this.versuche.gesperrt(e)) return err('GESPERRT');
    const konto = await this.konten.findeNachEmail(e);
    const passwortOk = await this.krypto.pruefePasswort(
      passwort,
      konto?.passwortHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA', // gleiche Rechenzeit
    );
    if (!konto || !passwortOk || !this.krypto.pruefeEinmalcode(konto.totpGeheimnis, code.trim())) {
      this.versuche.fehlschlag(e);
      return err('UNGUELTIG');
    }
    this.versuche.erfolg(e);
    const token = this.krypto.neuesToken();
    await this.sitzungen.lege(konto.id, token, SITZUNG_STUNDEN);
    await this.konten.merkeLogin(konto.id);
    return ok({ token, stunden: SITZUNG_STUNDEN });
  }

  pruefe(token: string) {
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

  async bestaetigeTermin(id: string, ortSlug: string, adminId: string) {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    return b ? this.termine.bestaetige(id, b) : false;
  }

  async loescheTermin(id: string, ortSlug: string, adminId: string) {
    const b = await this.berechtigungFuer(ortSlug, adminId);
    return b ? this.termine.loesche(id, b) : false;
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
    return validiereTermin({
      ortSlug: b.ortSlug,
      landkreis: b.landkreis,
      datum: f.datum,
      beginn: f.beginn || null,
      titel: f.titel,
      veranstaltungsort: f.veranstaltungsort ?? null,
      kategorie: f.kategorie || erkenneKategorie(f.titel),
      bestaetigt: f.bestaetigt ?? false,
      band: f.band ?? null,
      info: f.info ?? null,
    });
  }
}
