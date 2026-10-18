/**
 * Kartenkacheln über den eigenen Server (Issue #103): Der Browser fragt nur
 * kirmeskalender-thueringen.de, keine IP-Adresse geht an OpenStreetMap. Damit niemand den
 * Server als offenen Kachel-Proxy nutzt, gibt es nur Kacheln rund um Thüringen.
 */
export const ZOOM_MAX = 19;
/**
 * Deutschland mit Rand (Grad) – breit genug, dass auch große Bildschirme rund um Thüringen keine
 * Lücken haben (Issue #129), aber kein offener Proxy für die ganze Welt.
 */
export const GRENZE = { west: 5.0, ost: 16.0, sued: 46.8, nord: 55.5 };

const kachelX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const kachelY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Gültige Kachel? Ganze Zahlen, im Zoom-Bereich und (ab Zoom 6) innerhalb von GRENZE. */
export function kachelErlaubt(
  zRoh: string,
  xRoh: string,
  yRoh: string,
): [number, number, number] | null {
  if (![zRoh, xRoh, yRoh].every((v) => /^\d{1,7}$/.test(v))) return null;
  const [z, x, y] = [Number(zRoh), Number(xRoh), Number(yRoh)];
  if (z > ZOOM_MAX || x >= 2 ** z || y >= 2 ** z) return null;
  if (z < 6) return [z, x, y];
  const inX = x >= kachelX(GRENZE.west, z) && x <= kachelX(GRENZE.ost, z);
  const inY = y >= kachelY(GRENZE.nord, z) && y <= kachelY(GRENZE.sued, z);
  return inX && inY ? [z, x, y] : null;
}

/** Kleiner LRU-Speicher im Arbeitsspeicher (Kacheln sind ~15 KB). */
export class KachelSpeicher {
  private readonly daten = new Map<string, { bild: ArrayBuffer; bis: number }>();
  constructor(
    private readonly max = 3000,
    private readonly ms = 7 * 24 * 3600_000,
  ) {}
  hole(k: string, jetzt = Date.now()): ArrayBuffer | null {
    const e = this.daten.get(k);
    if (!e || e.bis < jetzt) {
      this.daten.delete(k);
      return null;
    }
    this.daten.delete(k);
    this.daten.set(k, e);
    return e.bild;
  }
  lege(k: string, bild: ArrayBuffer, jetzt = Date.now()) {
    this.daten.set(k, { bild, bis: jetzt + this.ms });
    for (const alt of this.daten.keys()) {
      if (this.daten.size <= this.max) break;
      this.daten.delete(alt);
    }
  }
  get groesse() {
    return this.daten.size;
  }
}

export const USER_AGENT =
  'Kirmeskalender-Thueringen/1.0 (+https://kirmeskalender-thueringen.de/impressum)';

/** Nur Anfragen von der eigenen Seite (Browser setzen Sec-Fetch-Site); fehlt der Header, erlaubt. */
export const vonUns = (h: Headers) => {
  const s = h.get('sec-fetch-site');
  return !s || s === 'same-origin' || s === 'none';
};
