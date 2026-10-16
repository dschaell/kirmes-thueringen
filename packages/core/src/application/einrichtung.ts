/**
 * Ersten Redaktionszugang im Browser einrichten (Issue #48) – ohne Server-Shell und ohne Skripte.
 *
 * Solange es keinen Admin gibt, kann jede Person einen Einrichtungslink anfordern. Der Link geht
 * aber immer an das feste Redaktionspostfach (nie an eine eingegebene Adresse). Wer den Link
 * öffnet, beweist damit Zugriff auf dieses Postfach. Abgeschlossen wird erst, wenn auch ein Code
 * aus der Authenticator-App stimmt – so ist der zweite Faktor sicher eingerichtet.
 * Sobald ein Admin existiert, ist die Einrichtung gesperrt, auch mit gültigem Link.
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import { SITZUNG_STUNDEN, type Sitzungen } from './admin.js';
import type { Drosselung, Postausgang } from './meldungen.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface ErsterAdmin {
  gibtEs(): Promise<boolean>;
  /** Legt das Konto nur an, solange es noch keinen Admin gibt; sonst null. */
  legeAn(email: string, passwortHash: string, totpGeheimnis: string): Promise<string | null>;
}
export interface EinrichtungsKrypto {
  hashePasswort(passwort: string): Promise<string>;
  neuesTotpGeheimnis(): string;
  pruefeEinmalcode(geheimnis: string, code: string): boolean;
  neuesToken(): string;
}
/** Kurzlebige Einrichtungslinks; das TOTP-Geheimnis hängt am Link (bleibt beim Neuladen gleich). */
export interface Einrichtungslinks {
  lege(totpGeheimnis: string): string;
  finde(link: string): { totpGeheimnis: string } | null;
  verbrauche(link: string): void;
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export const PASSWORT_MIN = 12;
export const EINRICHTUNG_MINUTEN = 30;
export type EinrichtungsFehler = 'SCHON_EINGERICHTET' | 'ZU_VIELE' | 'LINK_UNGUELTIG';
export interface Abschluss {
  email: string;
  passwort: string;
  passwortWiederholung: string;
  code: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+$/;

export class Ersteinrichtung {
  constructor(
    private readonly admins: ErsterAdmin,
    private readonly krypto: EinrichtungsKrypto,
    private readonly links: Einrichtungslinks,
    private readonly post: Postausgang,
    private readonly drosselung: Drosselung,
    private readonly sitzungen: Sitzungen,
    private readonly websiteUrl: string,
  ) {}

  async offen(): Promise<boolean> {
    return !(await this.admins.gibtEs());
  }

  /** Schickt einen Einrichtungslink an das Redaktionspostfach. */
  async sendeLink(): Promise<Result<void, EinrichtungsFehler>> {
    if (!(await this.offen())) return err('SCHON_EINGERICHTET');
    if (!this.drosselung.erlaube('einrichtung')) return err('ZU_VIELE');
    const link = this.links.lege(this.krypto.neuesTotpGeheimnis());
    const url = `${this.websiteUrl.replace(/\/+$/, '')}/admin/einrichten?link=${encodeURIComponent(link)}`;
    await this.post.sende({
      betreff: 'Redaktionszugang einrichten – Kirmeskalender Thüringen',
      text: [
        'Hallo,',
        '',
        'für den Kirmeskalender wurde die Einrichtung des Redaktionszugangs angefordert.',
        `Über diesen Link legst du Anmelde-E-Mail, Passwort und Authenticator-App fest (${EINRICHTUNG_MINUTEN} Minuten gültig, nur einmal nutzbar):`,
        '',
        url,
        '',
        'Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.',
      ].join('\n'),
    });
    return ok(undefined);
  }

  /** Daten für die Einrichtungsseite (TOTP-Geheimnis für den QR-Code). */
  async pruefeLink(link: string): Promise<Result<{ totpGeheimnis: string }, EinrichtungsFehler>> {
    if (!(await this.offen())) return err('SCHON_EINGERICHTET');
    const l = this.links.finde(link);
    return l ? ok({ totpGeheimnis: l.totpGeheimnis }) : err('LINK_UNGUELTIG');
  }

  async schliesseAb(
    link: string,
    a: Abschluss,
  ): Promise<
    Result<{ token: string; stunden: number }, EinrichtungsFehler | Validierungsfehler[]>
  > {
    const l = this.links.finde(link);
    if (!l) return err('LINK_UNGUELTIG');
    if (!(await this.offen())) return err('SCHON_EINGERICHTET');

    const email = a.email.trim().toLowerCase();
    const fehler: Validierungsfehler[] = [];
    if (!EMAIL.test(email) || email.length > 200) {
      fehler.push({ feld: 'email', code: 'EMAIL', meldung: 'Bitte eine gültige E-Mail-Adresse.' });
    }
    if (a.passwort.length < PASSWORT_MIN) {
      fehler.push({
        feld: 'passwort',
        code: 'PASSWORT_KURZ',
        meldung: `Das Passwort braucht mindestens ${PASSWORT_MIN} Zeichen.`,
      });
    } else if (a.passwort !== a.passwortWiederholung) {
      fehler.push({
        feld: 'passwortWiederholung',
        code: 'PASSWORT_UNGLEICH',
        meldung: 'Die Passwörter stimmen nicht überein.',
      });
    }
    if (!this.krypto.pruefeEinmalcode(l.totpGeheimnis, a.code.trim())) {
      fehler.push({
        feld: 'code',
        code: 'CODE',
        meldung: 'Der Code aus der Authenticator-App stimmt nicht – bitte den aktuellen eingeben.',
      });
    }
    if (fehler.length) return err(fehler);

    const hash = await this.krypto.hashePasswort(a.passwort);
    const id = await this.admins.legeAn(email, hash, l.totpGeheimnis);
    if (!id) return err('SCHON_EINGERICHTET'); // gleichzeitig hat jemand anderes abgeschlossen
    this.links.verbrauche(link);
    const token = this.krypto.neuesToken();
    await this.sitzungen.lege(id, token, SITZUNG_STUNDEN);
    return ok({ token, stunden: SITZUNG_STUNDEN });
  }
}
