/**
 * Ersten Admin im Browser einrichten (Issues #48, #56) – ohne Server-Shell, nur mit Passkey.
 *
 * Solange es keinen Admin gibt, kann jede Person einen Einrichtungslink anfordern. Der Link geht
 * aber immer an das feste Redaktionspostfach (nie an eine eingegebene Adresse). Wer den Link
 * öffnet, beweist damit Zugriff auf dieses Postfach, wählt einen Anzeigenamen und legt einen
 * Passkey an. Sobald ein Admin existiert, ist die Einrichtung gesperrt, auch mit gültigem Link.
 * Dient zugleich als Notfallweg, falls alle Admins entfernt wurden.
 */
import { err, ok, type Result, type Validierungsfehler } from '../domain/result.js';
import type { Drosselung, Postausgang } from './meldungen.js';
import type { Registrierung, RegistrierungsFehler } from './mitglieder.js';

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface ErsterAdmin {
  gibtEs(): Promise<boolean>;
}
/** Kurzlebige Einrichtungslinks (nur im Arbeitsspeicher). */
export interface Einrichtungslinks {
  lege(): string;
  gueltig(link: string): boolean;
  verbrauche(link: string): void;
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export const EINRICHTUNG_MINUTEN = 30;
export type EinrichtungsFehler = 'SCHON_EINGERICHTET' | 'ZU_VIELE' | 'LINK_UNGUELTIG';

export class Ersteinrichtung {
  constructor(
    private readonly admins: ErsterAdmin,
    private readonly links: Einrichtungslinks,
    private readonly post: Postausgang,
    private readonly drosselung: Drosselung,
    private readonly registrierung: Registrierung,
    private readonly websiteUrl: string,
  ) {}

  async offen(): Promise<boolean> {
    return !(await this.admins.gibtEs());
  }

  /** Schickt einen Einrichtungslink an das Redaktionspostfach. */
  async sendeLink(): Promise<Result<void, EinrichtungsFehler>> {
    if (!(await this.offen())) return err('SCHON_EINGERICHTET');
    if (!this.drosselung.erlaube('einrichtung')) return err('ZU_VIELE');
    const link = this.links.lege();
    const url = `${this.websiteUrl.replace(/\/+$/, '')}/admin/einrichten?link=${encodeURIComponent(link)}`;
    await this.post.sende({
      betreff: 'Redaktionszugang einrichten – Kirmeskalender Thüringen',
      text: [
        'Hallo,',
        '',
        'für den Kirmeskalender wurde die Einrichtung des Admin-Zugangs angefordert.',
        `Über diesen Link legst du deinen Passkey an (${EINRICHTUNG_MINUTEN} Minuten gültig, nur einmal nutzbar):`,
        '',
        url,
        '',
        'Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.',
      ].join('\n'),
    });
    return ok(undefined);
  }

  async pruefeLink(link: string): Promise<Result<void, EinrichtungsFehler>> {
    if (!(await this.offen())) return err('SCHON_EINGERICHTET');
    return this.links.gueltig(link) ? ok(undefined) : err('LINK_UNGUELTIG');
  }

  async starte(
    link: string,
    name: string,
  ): Promise<
    Result<{ vorgang: string; optionen: unknown }, EinrichtungsFehler | Validierungsfehler[]>
  > {
    const p = await this.pruefeLink(link);
    if (!p.ok) return p;
    return this.registrierung.starte(name, 'admin', `einrichtung:${link}`);
  }

  async schliesseAb(
    link: string,
    vorgang: string,
    antwort: unknown,
  ): Promise<
    Result<{ token: string; stunden: number }, EinrichtungsFehler | RegistrierungsFehler>
  > {
    if (!this.links.gueltig(link)) return err('LINK_UNGUELTIG');
    const r = await this.registrierung.beende(vorgang, antwort, `einrichtung:${link}`, {
      art: 'erster-admin',
    });
    if (!r.ok) return r.error === 'VERGEBEN' ? err('SCHON_EINGERICHTET') : r;
    this.links.verbrauche(link);
    return ok({ token: r.value.token, stunden: r.value.stunden });
  }
}
