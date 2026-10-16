/** Öffentliche Vorschläge bleiben bis zur bewussten Übernahme von Terminen getrennt. */
import { err, ok, type Validierungsfehler } from '../domain/result.js';
import { validiereTermin, type NeuerTermin } from '../domain/termin.js';
import { validiereSpeisen, type Speise } from '../domain/speisen.js';
import type { Sitzungen } from './admin.js';
import type { OrtRepository } from './ports.js';
import type { Drosselung, Postausgang } from './meldungen.js';
import { erkenneKategorie } from './recherche.js';
import { validiereAlle, type TerminFormular } from './termine-verwalten.js';

export interface VorschlagsZeile extends TerminFormular {
  speisen?: { name: string; preis: string }[];
}
export interface VorschlagEingabe {
  ortSlug: string;
  zeilen: VorschlagsZeile[];
  kontaktName?: string;
  kontaktEmail?: string;
  nachricht?: string;
  falle?: string;
  dauerMs?: number;
}
export interface VorschlagsTermin extends NeuerTermin {
  speisen: readonly Speise[];
}
export interface NeuerVorschlag {
  ortSlug: string;
  kontaktName: string | null;
  kontaktEmail: string | null;
  nachricht: string | null;
  termine: VorschlagsTermin[];
}
export interface Vorschlag extends NeuerVorschlag {
  id: string;
  ortName: string;
  erstelltAm: string;
}
export interface VorschlagsRepository {
  /** Ortszeile sperren und Grenze in derselben Transaktion prüfen. */
  lege(v: NeuerVorschlag): Promise<boolean>;
  liste(): Promise<Vorschlag[]>;
  finde(id: string): Promise<Vorschlag | null>;
  anzahl(): Promise<number>;
  /** Status sperren; Termine, Speisen, Protokoll und Kontaktlöschung atomar. Keine Upserts. */
  uebernehme(
    id: string,
    termine: VorschlagsTermin[],
    adminId: string,
  ): Promise<boolean | 'KONFLIKT'>;
  lehneAb(id: string, grund: string | null, adminId: string): Promise<boolean>;
  raeumeAuf(): Promise<void>;
}
const text = (s: string | null | undefined) => (s ?? '').replace(/\p{Cc}/gu, ' ').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (feld: string, meldung: string): Validierungsfehler => ({
  feld,
  code: 'UNGUELTIG',
  meldung,
});

export async function pruefeVorschlag(e: VorschlagEingabe, orte: OrtRepository) {
  const f: Validierungsfehler[] = [];
  const kontaktName = text(e.kontaktName) || null;
  const kontaktEmail = text(e.kontaktEmail) || null;
  const nachricht = text(e.nachricht) || null;
  if ((kontaktName?.length ?? 0) > 120)
    f.push(fehler('kontaktName', 'Name: höchstens 120 Zeichen.'));
  if (
    kontaktEmail &&
    (kontaktEmail.length > 200 ||
      !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(kontaktEmail))
  ) {
    f.push(fehler('kontaktEmail', 'Bitte eine gültige E-Mail-Adresse angeben.'));
  }
  if ((nachricht?.length ?? 0) > 2000)
    f.push(fehler('nachricht', 'Nachricht: höchstens 2000 Zeichen.'));
  const ort = await orte.finde(e.ortSlug);
  if (!ort) return err([fehler('ortSlug', 'Bitte einen Ort aus dem Ortsverzeichnis wählen.')]);
  const speisen: Speise[][] = [];
  const v = validiereAlle(e.zeilen, (z) => {
    const s = validiereSpeisen(
      (z.speisen ?? []).map((s) => ({ name: text(s.name), preis: text(s.preis) })),
    );
    if (!s.ok) return s;
    speisen.push(s.value);
    if (text(z.veranstaltungsort).length > 120)
      return err([fehler('veranstaltungsort', 'Wo genau: höchstens 120 Zeichen.')]);
    return validiereTermin({
      ...z,
      ortSlug: ort.slug,
      landkreis: ort.landkreis,
      titel: text(z.titel),
      beginn: z.beginn || null,
      band: text(z.band),
      info: text(z.info),
      veranstaltungsort: text(z.veranstaltungsort),
      kategorie: erkenneKategorie(text(z.titel)),
      bestaetigt: false,
    });
  });
  if (!v.ok) f.push(...v.error);
  if (f.length || !v.ok) return err(f);
  return ok({
    ortSlug: ort.slug,
    kontaktName,
    kontaktEmail,
    nachricht,
    termine: v.value.termine.map((t, i) => ({ ...t, speisen: speisen[i] ?? [] })),
  } satisfies NeuerVorschlag);
}

export class Vorschlaege {
  constructor(
    private readonly repo: VorschlagsRepository,
    private readonly orte: OrtRepository,
    private readonly sitzungen: Sitzungen,
    private readonly post: Postausgang,
    private readonly jeAbsender: Drosselung,
    private readonly gesamt: Drosselung,
    private readonly website: string,
  ) {}
  async melde(e: VorschlagEingabe, herkunft: string) {
    if (text(e.falle) || !Number.isFinite(e.dauerMs) || (e.dauerMs ?? 0) < 3000)
      return ok({ angenommen: true });
    if (!this.jeAbsender.erlaube(herkunft) || !this.gesamt.erlaube('gesamt'))
      return err('ZU_VIELE' as const);
    const v = await pruefeVorschlag(e, this.orte);
    if (!v.ok) return v;
    if (!(await this.repo.lege(v.value))) return err('ORT_VOLL' as const);
    // Der gespeicherte Vorschlag bleibt bei einer Mailstörung erreichbar. Kein zweites Eintragen erzwingen.
    try {
      await this.post.sende({
        betreff: `Neuer Kirmesvorschlag: ${v.value.ortSlug}`,
        text: `Ort: ${v.value.ortSlug}\nVeranstaltungen: ${v.value.termine.length}\nBitte prüfen: ${this.website.replace(/\/$/, '')}/admin/vorschlaege`,
        ...(v.value.kontaktEmail ? { antwortAn: v.value.kontaktEmail } : {}),
      });
    } catch {
      /* Keine Kontaktdaten oder SMTP-Fehler mit Adressen protokollieren. */
    }
    return ok({ angenommen: true });
  }
  private async berechtigt(token: string) {
    const s = token ? await this.sitzungen.pruefe(token) : null;
    return s && (s.rolle === 'admin' || s.rolle === 'redaktion') ? s : null;
  }
  async liste(token: string) {
    return (await this.berechtigt(token)) ? ok(await this.repo.liste()) : err('VERBOTEN' as const);
  }
  async anzahl(token: string) {
    return (await this.berechtigt(token)) ? ok(await this.repo.anzahl()) : err('VERBOTEN' as const);
  }
  async finde(token: string, id: string) {
    if (!(await this.berechtigt(token))) return err('VERBOTEN' as const);
    const v = UUID.test(id) ? await this.repo.finde(id) : null;
    return v ? ok(v) : err('NICHT_GEFUNDEN' as const);
  }
  async uebernehme(token: string, id: string, e: VorschlagEingabe, bestaetigt: boolean) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    if (!UUID.test(id) || !(await this.repo.finde(id))) return err('NICHT_GEFUNDEN' as const);
    const v = await pruefeVorschlag(e, this.orte);
    if (!v.ok) return v;
    const r = await this.repo.uebernehme(
      id,
      v.value.termine.map((t) => ({ ...t, bestaetigt })),
      s.adminId,
    );
    return r === 'KONFLIKT'
      ? err('KONFLIKT' as const)
      : r
        ? ok(true)
        : err('NICHT_GEFUNDEN' as const);
  }
  async lehneAb(token: string, id: string, grund?: string) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    const g = text(grund);
    if (g.length > 500) return err([fehler('grund', 'Grund: höchstens 500 Zeichen.')]);
    return UUID.test(id) && (await this.repo.lehneAb(id, g || null, s.adminId))
      ? ok(true)
      : err('NICHT_GEFUNDEN' as const);
  }
}
