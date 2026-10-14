import { err, ok, type Result, type Validierungsfehler } from './result.js';

/** Thüringer Landkreise und kreisfreie Städte, Schlüssel = Kfz-Kennzeichen. */
export const LANDKREISE = {
  ABG: 'Altenburger Land',
  EIC: 'Eichsfeld',
  GTH: 'Gotha',
  GRZ: 'Greiz',
  HBN: 'Hildburghausen',
  IK: 'Ilm-Kreis',
  KYF: 'Kyffhäuserkreis',
  NDH: 'Nordhausen',
  SHK: 'Saale-Holzland-Kreis',
  SOK: 'Saale-Orla-Kreis',
  SLF: 'Saalfeld-Rudolstadt',
  SM: 'Schmalkalden-Meiningen',
  SÖM: 'Sömmerda',
  SON: 'Sonneberg',
  UH: 'Unstrut-Hainich-Kreis',
  WAK: 'Wartburgkreis',
  WL: 'Weimarer Land',
  EF: 'Erfurt',
  G: 'Gera',
  J: 'Jena',
  SHL: 'Suhl',
  WE: 'Weimar',
  EA: 'Eisenach',
} as const;

export type LandkreisKuerzel = keyof typeof LANDKREISE;

export const istLandkreis = (wert: string): wert is LandkreisKuerzel =>
  Object.hasOwn(LANDKREISE, wert);

export function parseLandkreis(wert: string): Result<LandkreisKuerzel, Validierungsfehler> {
  const k = wert.trim().toUpperCase();
  return istLandkreis(k)
    ? ok(k)
    : err({
        feld: 'landkreis',
        code: 'LANDKREIS_UNBEKANNT',
        meldung: `„${wert}“ ist kein Thüringer Landkreis.`,
      });
}
