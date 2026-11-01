/** Abhängigkeiten der HTTP-App – eigene Datei, damit Routen-Module sie ohne Zyklus nutzen (#199). */
import type {
  Beitraege,
  FindeOrt,
  FindeTermin,
  Korrekturen,
  ListeOrte,
  MeldeAnRedaktion,
  Mitteilung,
  Plakate,
  Zugriffe,
  SucheTermine,
  Vorschlaege,
} from '@kirmes/core';
import type { FastifyServerOptions } from 'fastify';
import type { AdminAbhaengigkeiten } from './admin-routen.js';
import type { PushAbhaengigkeiten } from './push-routen.js';

export interface AppAbhaengigkeiten {
  sucheTermine: SucheTermine;
  listeOrte: ListeOrte;
  findeOrt: FindeOrt;
  findeTermin: FindeTermin;
  /** Neueste veröffentlichte Mitteilung (öffentlich) */
  aktuelleMitteilung: () => Promise<Mitteilung | null>;
  /** Redaktionszugang; ohne diese Abhängigkeit gibt es keine Admin-Endpunkte */
  admin?: Omit<AdminAbhaengigkeiten, 'terminDto'>;
  /** Meldungen an die Redaktion per E-Mail; fehlt sie, antwortet der Endpunkt mit 503 */
  meldungen?: MeldeAnRedaktion;
  terminVorschlaege?: Vorschlaege;
  korrekturen?: Korrekturen;
  /** Zugriffszahlen ohne Tracking (Issue #311) – Meldung nur aus dem internen Netz */
  zugriffe?: Zugriffe;
  /** Plakate je Termin (Issue #297), öffentlich lesbar */
  plakate?: Plakate;
  /** Beiträge mit Fotos (Issue #352), veröffentlichte öffentlich lesbar */
  beitraege?: Beitraege;
  /** Push-Benachrichtigungen (Issue #348); nur mit VAPID-Schlüsseln */
  push?: PushAbhaengigkeiten;
  datenbankErreichbar: () => Promise<boolean>;
  logger?: FastifyServerOptions['logger'];
}
