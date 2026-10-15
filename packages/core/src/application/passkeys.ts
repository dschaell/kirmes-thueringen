/**
 * Passkeys (WebAuthn) für die Redaktion: Einrichten nach normaler Anmeldung, danach Anmeldung
 * ohne Passwort und Einmalcode. Der Passkey verlangt Benutzerverifikation (Biometrie/PIN) und ist
 * an die Domain gebunden – damit ersetzt er beide Faktoren und ist phishing-resistent.
 * Die WebAuthn-Kryptografie liegt hinter dem Port {@link WebAuthn}.
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import {
  SITZUNG_STUNDEN,
  type AdminKonten,
  type Anmeldeversuche,
  type Kryptografie,
  type Sitzungen,
} from './admin.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface Passkey {
  id: string;
  adminId: string;
  /** Credential-ID (Base64URL), wie der Browser sie liefert */
  credentialId: string;
  publicKey: Uint8Array;
  /** Signaturzähler des Authenticators (0 = Authenticator zählt nicht, z. B. iCloud-Schlüsselbund) */
  zaehler: number;
  transports: string[];
  name: string;
  erstelltAm: string;
  zuletztGenutzt: string | null;
}
export type PasskeyInfo = Pick<Passkey, 'id' | 'name' | 'erstelltAm' | 'zuletztGenutzt'>;
export type NeuerPasskey = Pick<
  Passkey,
  'adminId' | 'credentialId' | 'publicKey' | 'zaehler' | 'transports' | 'name'
>;

export interface PasskeyRepository {
  liste(adminId: string): Promise<Passkey[]>;
  findeNachCredential(credentialId: string): Promise<Passkey | null>;
  lege(p: NeuerPasskey): Promise<PasskeyInfo>;
  merkeNutzung(id: string, zaehler: number): Promise<void>;
  loesche(adminId: string, id: string): Promise<boolean>;
}

/** Geprüfter neuer Schlüssel aus einer Registrierung. */
export interface RegistrierterSchluessel {
  credentialId: string;
  publicKey: Uint8Array;
  zaehler: number;
  transports: string[];
}

/** WebAuthn-Protokoll (Optionen erzeugen, Antworten prüfen). Optionen sind für den Core undurchsichtig. */
export interface WebAuthn {
  registrierungsOptionen(
    admin: { id: string; email: string },
    vorhandene: Passkey[],
  ): Promise<{ optionen: unknown; challenge: string }>;
  pruefeRegistrierung(antwort: unknown, challenge: string): Promise<RegistrierterSchluessel | null>;
  anmeldeOptionen(): Promise<{ optionen: unknown; challenge: string }>;
  /** Credential-ID aus einer Anmeldeantwort (ungeprüft – nur zum Nachschlagen) */
  credentialIdAus(antwort: unknown): string | null;
  /** null = Signatur, Challenge, Herkunft oder Benutzerverifikation stimmen nicht */
  pruefeAnmeldung(
    antwort: unknown,
    challenge: string,
    passkey: Passkey,
  ): Promise<{ zaehler: number } | null>;
}

/** Einmal verwendbare Challenges mit kurzer Gültigkeit, gefunden über eine zufällige Vorgangs-ID. */
export interface Challenges {
  lege(zweck: 'einrichten' | 'anmelden', challenge: string, adminId: string | null): string;
  /** Liefert die Challenge genau einmal; danach oder nach Ablauf null. */
  nimm(
    vorgang: string,
    zweck: 'einrichten' | 'anmelden',
  ): { challenge: string; adminId: string | null } | null;
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export const PASSKEY_NAME_MAX = 60;
export const MAX_PASSKEYS = 10;
export type PasskeyFehler = 'UNGUELTIG' | 'GESPERRT';

/** Fehlversuche aller Passkey-Anmeldungen zählen unter einem Schlüssel (keine E-Mail im Spiel). */
const VERSUCHS_SCHLUESSEL = 'passkey';

export class Passkeys {
  constructor(
    private readonly repo: PasskeyRepository,
    private readonly webauthn: WebAuthn,
    private readonly challenges: Challenges,
    private readonly sitzungen: Sitzungen,
    private readonly konten: Pick<AdminKonten, 'merkeLogin'>,
    private readonly krypto: Pick<Kryptografie, 'neuesToken'>,
    private readonly versuche: Anmeldeversuche,
  ) {}

  async liste(adminId: string): Promise<PasskeyInfo[]> {
    return (await this.repo.liste(adminId)).map(({ id, name, erstelltAm, zuletztGenutzt }) => ({
      id,
      name,
      erstelltAm,
      zuletztGenutzt,
    }));
  }

  async starteEinrichtung(admin: { adminId: string; email: string }) {
    const vorhandene = await this.repo.liste(admin.adminId);
    const { optionen, challenge } = await this.webauthn.registrierungsOptionen(
      { id: admin.adminId, email: admin.email },
      vorhandene,
    );
    return { vorgang: this.challenges.lege('einrichten', challenge, admin.adminId), optionen };
  }

  async beendeEinrichtung(
    adminId: string,
    vorgang: string,
    antwort: unknown,
    name: string,
  ): Promise<Result<PasskeyInfo, Validierungsfehler[]>> {
    const n = name.trim().replace(/\s+/g, ' ') || 'Passkey';
    if (n.length > PASSKEY_NAME_MAX) {
      return err([
        { feld: 'name', code: 'NAME_LAENGE', meldung: `Name: max. ${PASSKEY_NAME_MAX} Zeichen.` },
      ]);
    }
    const c = this.challenges.nimm(vorgang, 'einrichten');
    if (!c || c.adminId !== adminId) {
      return err([
        {
          feld: 'vorgang',
          code: 'ABGELAUFEN',
          meldung: 'Die Einrichtung ist abgelaufen. Bitte noch einmal starten.',
        },
      ]);
    }
    if ((await this.repo.liste(adminId)).length >= MAX_PASSKEYS) {
      return err([
        {
          feld: 'name',
          code: 'ZU_VIELE',
          meldung: `Höchstens ${MAX_PASSKEYS} Passkeys – bitte zuerst einen alten löschen.`,
        },
      ]);
    }
    const schluessel = await this.webauthn.pruefeRegistrierung(antwort, c.challenge);
    if (!schluessel) {
      return err([
        {
          feld: 'antwort',
          code: 'UNGUELTIG',
          meldung: 'Der Passkey konnte nicht bestätigt werden.',
        },
      ]);
    }
    return ok(await this.repo.lege({ adminId, name: n, ...schluessel }));
  }

  loesche(adminId: string, id: string) {
    return this.repo.loesche(adminId, id);
  }

  async starteAnmeldung() {
    const { optionen, challenge } = await this.webauthn.anmeldeOptionen();
    return { vorgang: this.challenges.lege('anmelden', challenge, null), optionen };
  }

  /** Gleiche Antwort für unbekannten Passkey, falsche Signatur und abgelaufene Challenge. */
  async beendeAnmeldung(
    vorgang: string,
    antwort: unknown,
  ): Promise<Result<{ token: string; stunden: number }, PasskeyFehler>> {
    if (this.versuche.gesperrt(VERSUCHS_SCHLUESSEL)) return err('GESPERRT');
    const fehlschlag = () => {
      this.versuche.fehlschlag(VERSUCHS_SCHLUESSEL);
      return err('UNGUELTIG' as const);
    };
    const c = this.challenges.nimm(vorgang, 'anmelden');
    const credentialId = this.webauthn.credentialIdAus(antwort);
    const passkey = credentialId ? await this.repo.findeNachCredential(credentialId) : null;
    if (!c || !passkey) return fehlschlag();
    const geprueft = await this.webauthn.pruefeAnmeldung(antwort, c.challenge, passkey);
    if (!geprueft) return fehlschlag();
    // Geklonter Authenticator: Zähler muss steigen, sobald einer der beiden Werte zählt
    if ((geprueft.zaehler !== 0 || passkey.zaehler !== 0) && geprueft.zaehler <= passkey.zaehler) {
      return fehlschlag();
    }
    this.versuche.erfolg(VERSUCHS_SCHLUESSEL);
    await this.repo.merkeNutzung(passkey.id, geprueft.zaehler);
    const token = this.krypto.neuesToken();
    await this.sitzungen.lege(passkey.adminId, token, SITZUNG_STUNDEN);
    await this.konten.merkeLogin(passkey.adminId);
    return ok({ token, stunden: SITZUNG_STUNDEN });
  }
}
