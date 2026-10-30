/**
 * Plakat je Termin (Issue #297): Kirmesgesellschaft und Redaktion laden ein Bild hoch, die Seite
 * zeigt es statt des erzeugten Vorschaubilds. Jedes Bild wird neu kodiert (Metadaten wie GPS fallen
 * weg) und in zwei festen Größen gespeichert – das Original wird nie aufbewahrt.
 */
import { err, ok, type Result } from '../domain/result.js';
import type { Sitzung } from './admin.js';
import { darf } from './rechte.js';

/** Größte angenommene Datei (vor dem Umwandeln) */
export const PLAKAT_MAX_BYTES = 8 * 1024 * 1024;

export type PlakatGroesse = 'gross' | 'klein';

export interface Plakatbild {
  gross: Uint8Array;
  klein: Uint8Array;
  breite: number;
  hoehe: number;
}

// ── Ports ───────────────────────────────────────────────────────────────────────────────
/** Wandelt eine hochgeladene Datei in WebP-Bilder fester Größe; null = kein lesbares Bild. */
export interface Bildwandler {
  wandle(datei: Uint8Array): Promise<Plakatbild | null>;
}
export interface PlakatAblage {
  /** Ort des Termins (für die Rechteprüfung), null = Termin unbekannt */
  ortVon(terminId: string): Promise<string | null>;
  speichere(terminId: string, bild: Plakatbild, adminId: string): Promise<void>;
  /** false = es gab kein Plakat */
  loesche(terminId: string, adminId: string): Promise<boolean>;
  lade(terminId: string, groesse: PlakatGroesse): Promise<Uint8Array | null>;
}

export type PlakatFehler = 'NUR_ADMIN' | 'NICHT_GEFUNDEN' | 'ZU_GROSS' | 'KEIN_BILD';

// ── Use Case ────────────────────────────────────────────────────────────────────────────
export class Plakate {
  constructor(
    private readonly ablage: PlakatAblage,
    private readonly wandler: Bildwandler,
  ) {}

  /** Fremde Termine gibt es für die Kirmesgesellschaft nicht (wie beim Bearbeiten, Issue #180). */
  private async ortPruefen(akteur: Sitzung, terminId: string): Promise<PlakatFehler | null> {
    const ort = await this.ablage.ortVon(terminId);
    if (ort === null) return 'NICHT_GEFUNDEN';
    if (!darf(akteur, 'termine', ort))
      return darf(akteur, 'termine') ? 'NICHT_GEFUNDEN' : 'NUR_ADMIN';
    return null;
  }

  async lade(
    akteur: Sitzung,
    terminId: string,
    datei: Uint8Array,
  ): Promise<Result<{ breite: number; hoehe: number }, PlakatFehler>> {
    if (datei.byteLength > PLAKAT_MAX_BYTES) return err('ZU_GROSS');
    const f = await this.ortPruefen(akteur, terminId);
    if (f) return err(f);
    const bild = await this.wandler.wandle(datei);
    if (!bild) return err('KEIN_BILD');
    await this.ablage.speichere(terminId, bild, akteur.adminId);
    return ok({ breite: bild.breite, hoehe: bild.hoehe });
  }

  async entferne(akteur: Sitzung, terminId: string): Promise<Result<true, PlakatFehler>> {
    const f = await this.ortPruefen(akteur, terminId);
    if (f) return err(f);
    return (await this.ablage.loesche(terminId, akteur.adminId)) ? ok(true) : err('NICHT_GEFUNDEN');
  }

  /** Öffentlich: Plakate sind Teil der Terminseite. */
  zeige(terminId: string, groesse: PlakatGroesse): Promise<Uint8Array | null> {
    return this.ablage.lade(terminId, groesse);
  }
}
