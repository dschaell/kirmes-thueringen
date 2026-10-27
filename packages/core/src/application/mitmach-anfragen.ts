/**
 * Mitmach-Anfragen (Issue #279): Wer sich über „Mitmachen“ meldet, landet in einer Liste der
 * Redaktion. Der Admin nimmt an – dann geht sofort ein Einladungslink an die angegebene Adresse –
 * oder lehnt ab. Gespeichert wird nur, was im Formular steht; erledigte Anfragen werden nach
 * ANFRAGE_AUFBEWAHRUNG_TAGE gelöscht, unbeantwortete nach ANFRAGE_OFFEN_TAGE.
 */
import { err, ok, type Result } from '../domain/result.js';
import type { Rolle, Sitzung } from './admin.js';
import type { AnfragenAblage, Nachricht, NeueAnfrage } from './meldungen.js';
import type { Mitgliederverwaltung, VerwaltungsFehler } from './mitglieder.js';
import { EINLADUNG_TAGE } from './mitglieder.js';
import { darf } from './rechte.js';

export const ANFRAGE_AUFBEWAHRUNG_TAGE = 90;
export const ANFRAGE_OFFEN_TAGE = 180;

export type AnfrageStatus = 'offen' | 'angenommen' | 'abgelehnt';

export interface Anfrage extends NeueAnfrage {
  id: string;
  eingegangenAm: string;
  status: AnfrageStatus;
  erledigtAm: string | null;
  /** Name des Mitglieds, das entschieden hat (null = offen oder Konto entfernt) */
  erledigtVon: string | null;
}

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface AnfragenRepository extends AnfragenAblage {
  /** Offene zuerst (älteste oben), danach erledigte (neueste oben) */
  liste(): Promise<Anfrage[]>;
  finde(id: string): Promise<Anfrage | null>;
  /** Nur offene; false = schon erledigt oder unbekannt */
  erledige(id: string, status: Exclude<AnfrageStatus, 'offen'>, adminId: string): Promise<boolean>;
  raeumeAuf(erledigtTage: number, offenTage: number): Promise<void>;
}
/**
 * Versand an eine bestimmte Adresse – nur für Aktionen angemeldeter Admins. Besucherformulare
 * schreiben weiter ausschließlich an die Redaktion (meldungen.ts).
 */
export interface Einladungspost {
  sendeAn(empfaenger: string, n: Nachricht): Promise<void>;
}

export type AnfrageFehler = VerwaltungsFehler | 'ERLEDIGT' | 'VERSAND';

const ROLLEN_TEXT: Record<Rolle, string> = {
  admin: 'Admin',
  redaktion: 'Redaktion',
  kirmesgesellschaft: 'Kirmesgesellschaft',
};

/** Was man nach der Einrichtung tun kann (Issue #282) */
const DANACH: Record<Rolle, string> = {
  kirmesgesellschaft:
    'Danach könnt ihr eure Kirmestermine und Festplätze selbst eintragen und aktuell halten und weitere Leute aus eurem Verein dazuholen.',
  redaktion:
    'Danach kannst du Termine aller Orte eintragen und prüfen und Vorschläge von Besuchern freigeben.',
  admin:
    'Danach kannst du Termine aller Orte eintragen und prüfen, Vorschläge freigeben und Mitglieder verwalten.',
};

export function einladungsMail(name: string, rolle: Rolle, link: string, ort?: string | null) {
  const als =
    rolle === 'kirmesgesellschaft' && ort
      ? `für eure Kirmesgesellschaft in ${ort}`
      : `in der ${ROLLEN_TEXT[rolle]}`;
  return {
    betreff: 'Deine Einladung zum Kirmeskalender Thüringen',
    text: `Hallo ${name},\n\ndanke für deine Anfrage! Du kannst jetzt ${als} mitmachen.\n\nÖffne diesen Link, wähle deinen Anzeigenamen und richte einen Passkey ein (Fingerabdruck, Gesicht oder PIN deines Geräts – kein Passwort):\n\n${link}\n\n${DANACH[rolle]}\n\nDer Link gilt ${EINLADUNG_TAGE} Tage und kann einmal verwendet werden. Bitte nicht weitergeben.\n\nFragen? Einfach auf diese Mail antworten.\n\nKirmeskalender Thüringen\n`,
  };
}

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export class MitmachAnfragen {
  constructor(
    private readonly repo: AnfragenRepository,
    private readonly mitglieder: Pick<Mitgliederverwaltung, 'lade' | 'widerrufe'>,
    private readonly post: Einladungspost,
    private readonly websiteUrl: string,
  ) {}

  liste(akteur: Sitzung): Promise<Result<Anfrage[], AnfrageFehler>> {
    return darf(akteur, 'mitglieder')
      ? this.repo.liste().then(ok)
      : Promise.resolve(err('NUR_ADMIN' as const));
  }

  /**
   * Einladung anlegen, per Mail schicken, Anfrage abschließen. Schlägt der Versand fehl, wird die
   * Einladung widerrufen und die Anfrage bleibt offen – nichts hängt halb.
   */
  async nimmAn(
    akteur: Sitzung,
    id: string,
    rolle: Rolle,
    ortSlug = '',
  ): Promise<Result<{ email: string }, AnfrageFehler>> {
    if (!darf(akteur, 'mitglieder')) return err('NUR_ADMIN');
    const a = await this.repo.finde(id);
    if (!a) return err('NICHT_GEFUNDEN');
    if (a.status !== 'offen') return err('ERLEDIGT');
    const e = await this.mitglieder.lade(akteur, rolle, a.name, ortSlug);
    if (!e.ok) return e;
    const link = `${this.websiteUrl.replace(/\/+$/, '')}/admin/einladung?t=${encodeURIComponent(e.value.token)}`;
    try {
      await this.post.sendeAn(a.email, einladungsMail(a.name, rolle, link, e.value.ortName));
    } catch {
      await this.mitglieder.widerrufe(akteur, e.value.id);
      return err('VERSAND');
    }
    await this.repo.erledige(id, 'angenommen', akteur.adminId);
    return ok({ email: a.email });
  }

  /** Ohne Mail – die Redaktion kann bei Bedarf selbst antworten (Reply-To der Benachrichtigung). */
  async lehneAb(akteur: Sitzung, id: string): Promise<Result<true, AnfrageFehler>> {
    if (!darf(akteur, 'mitglieder')) return err('NUR_ADMIN');
    const a = await this.repo.finde(id);
    if (!a) return err('NICHT_GEFUNDEN');
    if (a.status !== 'offen') return err('ERLEDIGT');
    await this.repo.erledige(id, 'abgelehnt', akteur.adminId);
    return ok(true);
  }
}
