/**
 * Korrekturhinweise zu einem veröffentlichten Termin (Issue #107): „Stimmt etwas nicht?“ bezieht
 * sich auf genau diesen Termin – nicht auf eine neue Kirmes. Gleicher Schutz wie bei Vorschlägen.
 */
import { err, ok, type Validierungsfehler } from '../domain/result.js';
import type { Sitzung, Sitzungen } from './admin.js';
import { darf, nurEigenerOrt } from './rechte.js';
import type { Drosselung, Postausgang } from './meldungen.js';

export interface Korrektur {
  id: string;
  erstelltAm: string;
  text: string;
  kontaktName: string | null;
  kontaktEmail: string | null;
  termin: {
    id: string;
    titel: string;
    datum: string;
    beginn: string | null;
    ortName: string;
    /** für die Ortsprüfung der Kirmesgesellschaft (Issue #180) */
    ortSlug: string;
  };
}
export interface NeueKorrektur {
  terminId: string;
  text: string;
  kontaktName: string | null;
  kontaktEmail: string | null;
}
export interface KorrekturRepository {
  /** false, wenn es den Termin nicht gibt oder zu ihm schon zu viele offene Hinweise vorliegen */
  lege(k: NeueKorrektur): Promise<boolean>;
  liste(): Promise<Korrektur[]>;
  anzahl(): Promise<number>;
  erledige(id: string, adminId: string): Promise<boolean>;
  raeumeAuf(): Promise<void>;
}
export interface KorrekturEingabe {
  text: string;
  kontaktName?: string;
  kontaktEmail?: string;
  falle?: string;
  dauerMs?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sauber = (s: string | undefined) =>
  (s ?? '').replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' ')).trim();
const fehler = (feld: string, meldung: string): Validierungsfehler => ({
  feld,
  code: 'UNGUELTIG',
  meldung,
});

export function pruefeKorrektur(
  terminId: string,
  e: KorrekturEingabe,
): { ok: true; value: NeueKorrektur } | { ok: false; error: Validierungsfehler[] } {
  const f: Validierungsfehler[] = [];
  const text = sauber(e.text);
  const kontaktName = sauber(e.kontaktName).replace(/\n/g, ' ') || null;
  const kontaktEmail = sauber(e.kontaktEmail).replace(/\n/g, ' ') || null;
  if (!UUID.test(terminId)) f.push(fehler('termin', 'Unbekannter Termin.'));
  if (!text) f.push(fehler('text', 'Bitte beschreiben, was nicht stimmt.'));
  if (text.length > 2000) f.push(fehler('text', 'Höchstens 2.000 Zeichen.'));
  if ((kontaktName?.length ?? 0) > 120)
    f.push(fehler('kontaktName', 'Name: höchstens 120 Zeichen.'));
  if (
    kontaktEmail &&
    (kontaktEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontaktEmail))
  )
    f.push(fehler('kontaktEmail', 'Bitte eine gültige E-Mail-Adresse angeben.'));
  return f.length ? err(f) : ok({ terminId, text, kontaktName, kontaktEmail });
}

export class Korrekturen {
  constructor(
    private readonly repo: KorrekturRepository,
    private readonly sitzungen: Sitzungen,
    private readonly post: Postausgang,
    private readonly jeAbsender: Drosselung,
    private readonly gesamt: Drosselung,
    private readonly website: string,
  ) {}

  async melde(terminId: string, e: KorrekturEingabe, herkunft: string) {
    // Falle oder zu schnell ausgefüllt: still annehmen, nichts speichern
    if (sauber(e.falle) || !Number.isFinite(e.dauerMs) || (e.dauerMs as number) < 3000)
      return ok({ angenommen: true });
    if (!this.jeAbsender.erlaube(herkunft) || !this.gesamt.erlaube('gesamt'))
      return err('ZU_VIELE' as const);
    const k = pruefeKorrektur(terminId, e);
    if (!k.ok) return k;
    if (!(await this.repo.lege(k.value))) return err('NICHT_GEFUNDEN' as const);
    try {
      await this.post.sende({
        betreff: 'Korrekturhinweis zu einem Termin',
        text: `Bitte prüfen: ${this.website.replace(/\/$/, '')}/admin/vorschlaege#korrekturen`,
      });
    } catch {
      /* Hinweis ist gespeichert; keine Inhalte oder Adressen protokollieren. */
    }
    return ok({ angenommen: true });
  }
  private async berechtigt(token: string) {
    const s = token ? await this.sitzungen.pruefe(token) : null;
    return darf(s, 'korrekturen') ? s : null;
  }
  /** Kirmesgesellschaft sieht nur Hinweise zu Terminen ihres Ortes (Issue #180). */
  private async sichtbar(s: Sitzung) {
    const alle = await this.repo.liste();
    return alle.filter((k) => darf(s, 'korrekturen', k.termin.ortSlug));
  }
  async liste(token: string) {
    const s = await this.berechtigt(token);
    return s ? ok(await this.sichtbar(s)) : err('VERBOTEN' as const);
  }
  async anzahl(token: string) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    return ok(nurEigenerOrt(s) ? (await this.sichtbar(s)).length : await this.repo.anzahl());
  }
  async erledige(token: string, id: string) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    if (nurEigenerOrt(s) && !(await this.sichtbar(s)).some((k) => k.id === id))
      return err('NICHT_GEFUNDEN' as const);
    return UUID.test(id) && (await this.repo.erledige(id, s.adminId))
      ? ok(true)
      : err('NICHT_GEFUNDEN' as const);
  }
}
