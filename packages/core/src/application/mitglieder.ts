/**
 * Redaktion als Team (Issue #56): Mitglieder melden sich nur mit Passkey an. Gespeichert werden ein
 * selbst gewählter Anzeigename, die Rolle und der öffentliche Passkey-Schlüssel – keine E-Mail,
 * kein Passwort. Neue Mitglieder kommen über einen Einladungslink des Admins dazu; der erste
 * Admin über die Ersteinrichtung (einrichtung.ts).
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import {
  ROLLEN,
  SITZUNG_STUNDEN,
  type Kryptografie,
  type Rolle,
  type Sitzung,
  type Sitzungen,
} from './admin.js';
import type { Challenges, RegistrierterSchluessel, WebAuthn } from './passkeys.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface Mitglied {
  id: string;
  name: string;
  rolle: Rolle;
  /** Ort der Kirmesgesellschaft (sonst null) */
  ortName?: string | null;
  erstelltAm: string;
  letzterLogin: string | null;
  passkeys: number;
}
export interface MitgliederRepository {
  liste(): Promise<Mitglied[]>;
  setzeRolle(id: string, rolle: Rolle): Promise<boolean>;
  entferne(id: string): Promise<boolean>;
  anzahlAdmins(): Promise<number>;
}
export interface EinladungInfo {
  bezeichnung?: string;
  id: string;
  rolle: Rolle;
  ortName?: string | null;
  erstelltAm: string;
  laeuftAb: string;
}
export interface Einladungen {
  /** Speichert nur einen Hash des Tokens; gültig für `tage` Tage. */
  lege(
    token: string,
    rolle: Rolle,
    vonId: string | null,
    tage: number,
    bezeichnung?: string,
    /** Pflicht bei Kirmesgesellschaft; null = Ort unbekannt */
    ortSlug?: string | null,
  ): Promise<EinladungInfo | null>;
  /** Offene (unbenutzte, nicht abgelaufene) Einladung zum Token */
  finde(token: string): Promise<{ id: string; rolle: Rolle } | null>;
  offene(): Promise<EinladungInfo[]>;
  widerrufe(id: string): Promise<boolean>;
}
export interface NeuesKonto {
  name: string;
  rolle: Rolle;
  kennung: string;
}
/** Wann ein neues Konto angelegt werden darf – geprüft in derselben Transaktion wie das Anlegen. */
export type Anlagebedingung = { art: 'erster-admin' } | { art: 'einladung'; einladungId: string };
export interface KontoAnlage {
  /** Legt Konto + ersten Passkey an; null, wenn die Bedingung (nicht mehr) erfüllt ist. */
  lege(
    k: NeuesKonto,
    schluessel: RegistrierterSchluessel,
    passkeyName: string,
    bedingung: Anlagebedingung,
  ): Promise<string | null>;
}
export interface Kennungen {
  /** Zufällige, stabile WebAuthn-Kennung (user.id) für ein neues Konto */
  neueKennung(): string;
}

// ── Gemeinsam: neues Konto mit Passkey registrieren ────────────────────────────────────
export const NAME_MAX = 60;
export const EINLADUNG_TAGE = 7;
export type RegistrierungsFehler = 'ABGELAUFEN' | 'UNGUELTIG' | 'VERGEBEN';

export function pruefeName(roh: string): Result<string, Validierungsfehler[]> {
  const name = roh.trim().replace(/\s+/g, ' ');
  if (!name) {
    return err([{ feld: 'name', code: 'PFLICHT', meldung: 'Bitte einen Namen angeben.' }]);
  }
  // Keine Steuer-/Formatzeichen (z. B. Richtungsumkehr U+202E) – sonst ließen sich Namen fälschen
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return err([
      { feld: 'name', code: 'NAME_ZEICHEN', meldung: 'Der Name enthält unzulässige Zeichen.' },
    ]);
  }
  if (name.length > NAME_MAX) {
    return err([
      { feld: 'name', code: 'NAME_LAENGE', meldung: `Name: höchstens ${NAME_MAX} Zeichen.` },
    ]);
  }
  return ok(name);
}

/**
 * Zwei Schritte wie bei jedem Passkey: Optionen holen (Browser fragt Face ID/Touch ID), dann die
 * signierte Antwort prüfen. `quelle` bindet die Challenge an Link bzw. Einladung.
 */
export class Registrierung {
  constructor(
    private readonly webauthn: WebAuthn,
    private readonly challenges: Challenges,
    private readonly anlage: KontoAnlage,
    private readonly sitzungen: Sitzungen,
    private readonly krypto: Kryptografie & Kennungen,
  ) {}

  async starte(nameRoh: string, rolle: Rolle, quelle: string) {
    const name = pruefeName(nameRoh);
    if (!name.ok) return name;
    const kennung = this.krypto.neueKennung();
    const { optionen, challenge } = await this.webauthn.registrierungsOptionen(
      { kennung, name: name.value },
      [],
    );
    const vorgang = this.challenges.lege('beitreten', challenge, null, {
      name: name.value,
      rolle,
      kennung,
      quelle,
    });
    return ok({ vorgang, optionen });
  }

  async beende(
    vorgang: string,
    antwort: unknown,
    quelle: string,
    bedingung: Anlagebedingung,
  ): Promise<Result<{ token: string; stunden: number; adminId: string }, RegistrierungsFehler>> {
    const c = this.challenges.nimm(vorgang, 'beitreten');
    const d = c?.daten;
    if (!c || !d || d.quelle !== quelle || !ROLLEN.includes(d.rolle as Rolle)) {
      return err('ABGELAUFEN');
    }
    const schluessel = await this.webauthn.pruefeRegistrierung(antwort, c.challenge);
    if (!schluessel) return err('UNGUELTIG');
    const id = await this.anlage.lege(
      { name: d.name ?? '', rolle: d.rolle as Rolle, kennung: d.kennung ?? '' },
      schluessel,
      'Erster Passkey',
      bedingung,
    );
    if (!id) return err('VERGEBEN');
    const token = this.krypto.neuesToken();
    await this.sitzungen.lege(id, token, SITZUNG_STUNDEN);
    return ok({ token, stunden: SITZUNG_STUNDEN, adminId: id });
  }
}

// ── Einladung annehmen (ohne Sitzung) ───────────────────────────────────────────────────
export class Beitritt {
  constructor(
    private readonly einladungen: Einladungen,
    private readonly registrierung: Registrierung,
  ) {}

  async pruefe(token: string): Promise<Result<{ rolle: Rolle }, 'UNGUELTIG'>> {
    const e = await this.einladungen.finde(token);
    return e ? ok({ rolle: e.rolle }) : err('UNGUELTIG');
  }

  async starte(token: string, name: string) {
    const e = await this.einladungen.finde(token);
    if (!e) return err('ABGELAUFEN' as const);
    return this.registrierung.starte(name, e.rolle, `einladung:${e.id}`);
  }

  async beende(token: string, vorgang: string, antwort: unknown) {
    const e = await this.einladungen.finde(token);
    if (!e) return err('ABGELAUFEN' as const);
    return this.registrierung.beende(vorgang, antwort, `einladung:${e.id}`, {
      art: 'einladung',
      einladungId: e.id,
    });
  }
}

// ── Mitgliederverwaltung (nur Admin) ───────────────────────────────────────────────────
export type VerwaltungsFehler =
  'NUR_ADMIN' | 'LETZTER_ADMIN' | 'NICHT_GEFUNDEN' | 'BEZEICHNUNG' | 'ORT_FEHLT' | 'ROLLE';

export class Mitgliederverwaltung {
  constructor(
    private readonly mitglieder: MitgliederRepository,
    private readonly einladungen: Einladungen,
    private readonly krypto: Kryptografie,
  ) {}

  private nurAdmin<T>(akteur: Sitzung, f: () => Promise<Result<T, VerwaltungsFehler>>) {
    return akteur.rolle === 'admin' ? f() : Promise.resolve(err('NUR_ADMIN' as const));
  }

  liste(akteur: Sitzung) {
    return this.nurAdmin(akteur, async () => ok(await this.mitglieder.liste()));
  }

  /** Mindestens ein Admin bleibt immer – sonst könnte niemand mehr Mitglieder verwalten. */
  private async letzterAdmin(id: string): Promise<boolean> {
    const alle = await this.mitglieder.liste();
    const m = alle.find((x) => x.id === id);
    return m?.rolle === 'admin' && (await this.mitglieder.anzahlAdmins()) <= 1;
  }

  setzeRolle(akteur: Sitzung, id: string, rolle: Rolle) {
    return this.nurAdmin(akteur, async () => {
      // Zur Kirmesgesellschaft wird man nur per Einladung mit Ort (Issue #180)
      if (rolle === 'kirmesgesellschaft') return err('ROLLE' as const);
      if (rolle !== 'admin' && (await this.letzterAdmin(id))) return err('LETZTER_ADMIN' as const);
      return (await this.mitglieder.setzeRolle(id, rolle))
        ? ok(true)
        : err('NICHT_GEFUNDEN' as const);
    });
  }

  entferne(akteur: Sitzung, id: string) {
    return this.nurAdmin(akteur, async () => {
      if (await this.letzterAdmin(id)) return err('LETZTER_ADMIN' as const);
      return (await this.mitglieder.entferne(id)) ? ok(true) : err('NICHT_GEFUNDEN' as const);
    });
  }

  /** Neuer Einladungslink – das Token wird nur einmal gezeigt, gespeichert ist nur sein Hash. */
  lade(akteur: Sitzung, rolle: Rolle, bezeichnung = '', ortSlug = '') {
    return this.nurAdmin(akteur, async () => {
      const name = bezeichnung.trim().replace(/[\p{Cc}\p{Cf}]/gu, '');
      if (name.length > 120) return err('BEZEICHNUNG' as const);
      const ort = rolle === 'kirmesgesellschaft' ? ortSlug.trim() : '';
      if (rolle === 'kirmesgesellschaft' && !ort) return err('ORT_FEHLT' as const);
      const token = this.krypto.neuesToken();
      const info = await this.einladungen.lege(
        token,
        rolle,
        akteur.adminId,
        EINLADUNG_TAGE,
        name,
        ort || null,
      );
      if (!info) return err('ORT_FEHLT' as const);
      return ok({ ...info, token });
    });
  }

  offeneEinladungen(akteur: Sitzung) {
    return this.nurAdmin(akteur, async () => ok(await this.einladungen.offene()));
  }

  widerrufe(akteur: Sitzung, id: string) {
    return this.nurAdmin(akteur, async () =>
      (await this.einladungen.widerrufe(id)) ? ok(true) : err('NICHT_GEFUNDEN' as const),
    );
  }
}
