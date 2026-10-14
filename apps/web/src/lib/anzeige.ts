/** Darstellungs-Helfer des Frontends (keine Fachlogik – die liegt im Core bzw. hinter der API). */
import { LANDKREISE, type Kategorie, type LandkreisKuerzel } from '@kirmes/core';
import type { TerminDto } from './api';

export { LANDKREISE };

export const KATEGORIEN: Record<Kategorie, { label: string; emoji: string }> = {
  kirmes: { label: 'Kirmes & Kirmestanz', emoji: '🎪' },
  kinder: { label: 'Kindertanz & Familie', emoji: '🧒' },
  tanz: { label: 'Tanz & Feste', emoji: '💃' },
  party: { label: 'Disco & Party', emoji: '🪩' },
  brauchtum: { label: 'Brauchtum', emoji: '🌳' },
  ostern: { label: 'Ostern', emoji: '🐣' },
  mai: { label: 'Tanz in den Mai', emoji: '🌸' },
  fruehschoppen: { label: 'Frühschoppen', emoji: '🍺' },
};

export const kreisName = (k: LandkreisKuerzel) => LANDKREISE[k];

/** URL-Segment je Landkreis: „SÖM“ → „soem“ */
export const kreisSlug = (k: string) =>
  k.toLowerCase().replace('ö', 'oe').replace('ä', 'ae').replace('ü', 'ue');

export const kreisAusSlug = (slug: string): LandkreisKuerzel | undefined =>
  (Object.keys(LANDKREISE) as LandkreisKuerzel[]).find((k) => kreisSlug(k) === slug);

const fmtMonat = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const fmtLang = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export const monatName = (iso: string) => fmtMonat.format(new Date(iso));
export const datumLang = (iso: string) => fmtLang.format(new Date(iso));

/** Heute in Thüringer Ortszeit (YYYY-MM-DD). */
export const heute = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

export const plusTage = (iso: string, tage: number) =>
  new Date(Date.parse(iso) + tage * 86_400_000).toISOString().slice(0, 10);

/** schema.org Event für Google-Rich-Results */
export const eventJsonLd = (t: TerminDto, site: URL) => ({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: `${t.titel} – ${t.ort.name}`,
  startDate: t.beginn ? `${t.datum}T${t.beginn}:00` : t.datum,
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: {
    '@type': 'Place',
    name: t.veranstaltungsort ?? t.ort.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: t.ort.name,
      addressRegion: 'Thüringen',
      addressCountry: 'DE',
    },
    ...(t.ort.koordinate && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: t.ort.koordinate.lat,
        longitude: t.ort.koordinate.lon,
      },
    }),
  },
  url: new URL(`/orte/${t.ort.slug}`, site).href,
});
