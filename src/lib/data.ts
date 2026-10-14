import raw from '../data/termine.json';
import { KATEGORIEN, type Kategorie, type Termin } from './data-client';

export { KATEGORIEN, type Kategorie, type Termin };

export const termine = raw as Termin[];

export const KREISE: Record<string, string> = {
  SÖM: 'Sömmerda', EIC: 'Eichsfeld', WAK: 'Wartburgkreis', UH: 'Unstrut-Hainich-Kreis',
  GTH: 'Landkreis Gotha', IK: 'Ilm-Kreis', WL: 'Weimarer Land', HBN: 'Hildburghausen',
  KYF: 'Kyffhäuserkreis', SM: 'Schmalkalden-Meiningen', NDH: 'Nordhausen', SON: 'Sonneberg',
  SLF: 'Saalfeld-Rudolstadt', SOK: 'Saale-Orla-Kreis', SHK: 'Saale-Holzland-Kreis', GRZ: 'Greiz',
  ABG: 'Altenburger Land', EF: 'Erfurt', WE: 'Weimar', J: 'Jena', G: 'Gera', SHL: 'Suhl', EA: 'Eisenach',
};

export const kreisSlug = (k: string) =>
  k.toLowerCase().replace('ö', 'oe').replace('ä', 'ae').replace('ü', 'ue');

const fmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtMonat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const datumKurz = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : 'Datum offen');
export const datumLang = (iso: string | null) => (iso ? fmtLong.format(new Date(iso)) : 'Datum offen');
export const monatName = (iso: string) => fmtMonat.format(new Date(iso));

/** Heute (Build-Zeitpunkt) als ISO-Datum. Seite wird täglich neu gebaut. */
export const heute = () => new Date().toISOString().slice(0, 10);

export const kommende = (liste = termine) => {
  const h = heute();
  return liste.filter((t) => t.datum && t.datum >= h);
};

export interface Ort { slug: string; name: string; kreis: string | null; termine: Termin[] }

export const orte: Ort[] = (() => {
  const map = new Map<string, Ort>();
  for (const t of termine) {
    const o = map.get(t.ortSlug) ?? { slug: t.ortSlug, name: t.ort, kreis: t.kreis, termine: [] };
    o.kreis ??= t.kreis;
    o.termine.push(t);
    map.set(t.ortSlug, o);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
})();

/** schema.org Event für Google-Rich-Results */
export const eventJsonLd = (t: Termin, site: URL) =>
  t.datum && {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${t.titel} – ${t.ort}`,
    startDate: t.zeit ? `${t.datum}T${t.zeit.padStart(5, '0')}:00` : t.datum,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: t.location ?? t.ort,
      address: { '@type': 'PostalAddress', addressLocality: t.ort, addressRegion: 'Thüringen', addressCountry: 'DE' },
    },
    url: new URL(`/orte/${t.ortSlug}`, site).href,
  };
