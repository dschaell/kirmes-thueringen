/**
 * Beiträge mit Fotos (Issue #352): Kirmesgesellschaft und Redaktion schreiben kurze Beiträge zu
 * ihrem Ort („Kirmesbaum steht!“), optional mit bis zu sechs Fotos und an einen Termin geknüpft.
 * Fotos werden wie Plakate neu kodiert (ohne Metadaten/GPS). Ablauf: Entwurf anlegen → Fotos
 * hochladen → veröffentlichen (erst dann öffentlich und Push an alle, die dem Ort folgen).
 * Gelöscht wird nur von Hand – kein Ablaufdatum. Keine Kommentare, keine Likes.
 */
import { err, ok, type Result } from '../domain/result.js';
import type { Sitzung } from './admin.js';
import {
  PLAKAT_MAX_BYTES,
  type Bildwandler,
  type Plakatbild,
  type PlakatGroesse,
} from './plakate.js';
import { darf } from './rechte.js';

export const BEITRAG_MAX_TEXT = 1000;
export const BEITRAG_MAX_FOTOS = 6;
export const FOTO_ALT_MAX = 200;
/** Schutz vor Missbrauch und vollem Server: höchstens so viele Fotos je Ort (≈ 0,5 MB je Foto) */
export const FOTOS_JE_ORT_MAX = 600;
export const BEITRAEGE_JE_SEITE = 20;

export interface BeitragFoto {
  id: string;
  breite: number;
  hoehe: number;
  /** Bildbeschreibung für Screenreader; leer = Standardtext */
  alt: string;
}
export interface Beitrag {
  id: string;
  ortSlug: string;
  ortName: string;
  /** Name der Kirmesgesellschaft des Ortes, falls hinterlegt */
  kgName: string | null;
  text: string;
  termin: { id: string; titel: string; datum: string } | null;
  /** null = Entwurf */
  veroeffentlichtAm: string | null;
  fotos: BeitragFoto[];
}
export interface NeuerBeitrag {
  ortSlug: string;
  text: string;
  terminId?: string | null;
  /** Einwilligung: eigene Fotos, abgebildete Personen einverstanden */
  einverstanden: boolean;
}

// ── Ports ───────────────────────────────────────────────────────────────────────────────
export interface BeitragAblage {
  /** Entwurf anlegen; null = Ort unbekannt */
  lege(
    b: { ortSlug: string; text: string; terminId: string | null },
    adminId: string,
  ): Promise<string | null>;
  terminImOrt(terminId: string, ortSlug: string): Promise<boolean>;
  /** Ort, Stand und Fotozahl des Beitrags; null = unbekannt */
  stand(
    beitragId: string,
  ): Promise<{ ortSlug: string; veroeffentlicht: boolean; fotos: number; text: string } | null>;
  fotosImOrt(ortSlug: string): Promise<number>;
  legeFoto(beitragId: string, nr: number, bild: Plakatbild, alt: string): Promise<string>;
  /** Entwurf öffentlich machen; liefert den fertigen Beitrag */
  veroeffentliche(beitragId: string, adminId: string): Promise<Beitrag | null>;
  loesche(beitragId: string, adminId: string): Promise<boolean>;
  /** Neueste zuerst; `vor` = nur ältere als dieser Zeitpunkt (zum Weiterblättern) */
  liste(f: { ortSlug?: string; vor?: string; limit: number }): Promise<Beitrag[]>;
  /** Nur Fotos veröffentlichter Beiträge */
  foto(fotoId: string, groesse: PlakatGroesse): Promise<Uint8Array | null>;
}

export type BeitragFehler =
  | 'NUR_ADMIN'
  | 'NICHT_GEFUNDEN'
  | 'EINWILLIGUNG'
  | 'TEXT'
  | 'TERMIN'
  | 'LEER'
  | 'ALT'
  | 'ZU_GROSS'
  | 'KEIN_BILD'
  | 'ZU_VIELE_FOTOS'
  | 'SPEICHER'
  | 'VEROEFFENTLICHT';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Zeilenumbrüche bleiben, andere Steuerzeichen und überlange Leerzeilen fallen weg */
const mehrzeilig = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const zeile = (s: string) =>
  s
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export class Beitraege {
  constructor(
    private readonly ablage: BeitragAblage,
    private readonly wandler: Bildwandler,
    /** Nach dem Veröffentlichen (Push an Folgende); Fehler halten den Nutzer nicht auf */
    private readonly gemeldet?: (b: Beitrag) => Promise<unknown>,
  ) {}

  /** Fremde Orte gibt es für die Kirmesgesellschaft nicht (wie bei Terminen, Issue #180). */
  private ortFehler(akteur: Sitzung, ortSlug: string): BeitragFehler | null {
    if (darf(akteur, 'beitraege', ortSlug)) return null;
    return darf(akteur, 'beitraege') ? 'NICHT_GEFUNDEN' : 'NUR_ADMIN';
  }

  private async entwurf(akteur: Sitzung, beitragId: string) {
    const s = UUID.test(beitragId) ? await this.ablage.stand(beitragId) : null;
    if (!s) return err<BeitragFehler>('NICHT_GEFUNDEN');
    const f = this.ortFehler(akteur, s.ortSlug);
    return f ? err(f) : ok(s);
  }

  async schreibe(akteur: Sitzung, e: NeuerBeitrag): Promise<Result<{ id: string }, BeitragFehler>> {
    const f = this.ortFehler(akteur, e.ortSlug);
    if (f) return err(f);
    if (!e.einverstanden) return err('EINWILLIGUNG');
    const text = mehrzeilig(e.text);
    if (text.length > BEITRAG_MAX_TEXT) return err('TEXT');
    const terminId = e.terminId || null;
    if (terminId && !(UUID.test(terminId) && (await this.ablage.terminImOrt(terminId, e.ortSlug))))
      return err('TERMIN');
    const id = await this.ablage.lege({ ortSlug: e.ortSlug, text, terminId }, akteur.adminId);
    return id ? ok({ id }) : err('NICHT_GEFUNDEN');
  }

  async fuegeFotoHinzu(
    akteur: Sitzung,
    beitragId: string,
    datei: Uint8Array,
    altRoh: string,
  ): Promise<Result<{ id: string }, BeitragFehler>> {
    if (datei.byteLength > PLAKAT_MAX_BYTES) return err('ZU_GROSS');
    const s = await this.entwurf(akteur, beitragId);
    if (!s.ok) return s;
    if (s.value.veroeffentlicht) return err('VEROEFFENTLICHT');
    if (s.value.fotos >= BEITRAG_MAX_FOTOS) return err('ZU_VIELE_FOTOS');
    const alt = zeile(altRoh);
    if (alt.length > FOTO_ALT_MAX) return err('ALT');
    if ((await this.ablage.fotosImOrt(s.value.ortSlug)) >= FOTOS_JE_ORT_MAX) return err('SPEICHER');
    const bild = await this.wandler.wandle(datei);
    if (!bild) return err('KEIN_BILD');
    return ok({ id: await this.ablage.legeFoto(beitragId, s.value.fotos + 1, bild, alt) });
  }

  async veroeffentliche(
    akteur: Sitzung,
    beitragId: string,
  ): Promise<Result<Beitrag, BeitragFehler>> {
    const s = await this.entwurf(akteur, beitragId);
    if (!s.ok) return s;
    if (s.value.veroeffentlicht) return err('VEROEFFENTLICHT');
    if (!s.value.text && s.value.fotos === 0) return err('LEER');
    const b = await this.ablage.veroeffentliche(beitragId, akteur.adminId);
    if (!b) return err('NICHT_GEFUNDEN');
    this.gemeldet?.(b).catch(() => undefined);
    return ok(b);
  }

  async entferne(akteur: Sitzung, beitragId: string): Promise<Result<true, BeitragFehler>> {
    const s = await this.entwurf(akteur, beitragId);
    if (!s.ok) return s;
    return (await this.ablage.loesche(beitragId, akteur.adminId))
      ? ok(true)
      : err('NICHT_GEFUNDEN');
  }

  /** Öffentlich: veröffentlichte Beiträge, neueste zuerst – ganz Thüringen oder ein Ort. */
  liste(f: { ortSlug?: string; vor?: string; limit?: number } = {}): Promise<Beitrag[]> {
    const limit = Math.min(Math.max(1, f.limit ?? BEITRAEGE_JE_SEITE), 50);
    const vor = f.vor && !Number.isNaN(Date.parse(f.vor)) ? f.vor : undefined;
    return this.ablage.liste({ ortSlug: f.ortSlug, vor, limit });
  }

  foto(fotoId: string, groesse: PlakatGroesse): Promise<Uint8Array | null> {
    return UUID.test(fotoId) ? this.ablage.foto(fotoId, groesse) : Promise.resolve(null);
  }
}
