import { err, ok, type Result, type Validierungsfehler } from './result.js';

/** WGS84-Koordinate (Grad). */
export interface Koordinate {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Großzügiger Rahmen um Thüringen (inkl. Grenzorte). Schützt vor vertauschten Werten
 * (lon/lat) und Tippfehlern, die Besucher sonst in ein anderes Bundesland schicken.
 */
export const THUERINGEN_RAHMEN = { latMin: 50.1, latMax: 51.75, lonMin: 9.8, lonMax: 12.75 };

export function parseKoordinate(
  lat: unknown,
  lon: unknown,
): Result<Koordinate, Validierungsfehler> {
  const fehler = (meldung: string): Result<never, Validierungsfehler> =>
    err({ feld: 'koordinate', code: 'KOORDINATE_UNGUELTIG', meldung });
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
    return fehler('Breite und Länge müssen Zahlen sein.');
  }
  const r = THUERINGEN_RAHMEN;
  if (lat < r.latMin || lat > r.latMax || lon < r.lonMin || lon > r.lonMax) {
    return fehler('Der Punkt liegt nicht in Thüringen. Sind Breite und Länge vertauscht?');
  }
  // 6 Nachkommastellen ≈ 10 cm – genauer ist sinnlos
  return ok({ lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 });
}

/** Rechteckiger Kartenausschnitt (WGS84), z. B. der sichtbare Bereich einer Karte. */
export interface Kartenausschnitt {
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
}

/**
 * „minLon,minLat,maxLon,maxLat“ (Reihenfolge wie GeoJSON/OSM). Der Ausschnitt muss Thüringen
 * berühren und darf höchstens 5° breit/hoch sein – sonst ist es keine sinnvolle Kartenabfrage.
 */
export function parseKartenausschnitt(text: string): Result<Kartenausschnitt, Validierungsfehler> {
  const fehler = (meldung: string): Result<never, Validierungsfehler> =>
    err({ feld: 'bbox', code: 'AUSSCHNITT_UNGUELTIG', meldung });
  const teile = text.split(',').map((t) => Number(t.trim()));
  if (teile.length !== 4 || teile.some((z) => !Number.isFinite(z))) {
    return fehler('bbox: vier Zahlen „minLon,minLat,maxLon,maxLat“ erwartet.');
  }
  const [minLon, minLat, maxLon, maxLat] = teile as [number, number, number, number];
  if (minLon >= maxLon || minLat >= maxLat)
    return fehler('bbox: Minimum muss kleiner als Maximum sein.');
  if (maxLon - minLon > 5 || maxLat - minLat > 5)
    return fehler('bbox: Ausschnitt zu groß (max. 5°).');
  const r = THUERINGEN_RAHMEN;
  if (maxLat < r.latMin || minLat > r.latMax || maxLon < r.lonMin || minLon > r.lonMax) {
    return fehler('bbox: Ausschnitt liegt nicht in Thüringen.');
  }
  return ok({ minLon, minLat, maxLon, maxLat });
}

/** Ein Festplatz ist der konkrete Ort einer Veranstaltung (Festzelt, Saal, Sportplatz …). */
export interface Festplatz {
  /** '' = Standard-Festplatz des Ortes (gilt für Termine ohne passenden Veranstaltungsort) */
  readonly name: string;
  readonly koordinate: Koordinate;
}

const NAME_MAX = 120;

export function validiereFestplatz(e: {
  name: string;
  lat: unknown;
  lon: unknown;
}): Result<Festplatz, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];
  const name = e.name.trim();
  if (name.length > NAME_MAX) {
    fehler.push({ feld: 'name', code: 'NAME_ZU_LANG', meldung: `Max. ${NAME_MAX} Zeichen.` });
  }
  const k = parseKoordinate(e.lat, e.lon);
  if (!k.ok) fehler.push(k.error);
  if (fehler.length || !k.ok) return err(fehler);
  return ok({ name, koordinate: k.value });
}
