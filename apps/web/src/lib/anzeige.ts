/** Darstellungs-Helfer des Frontends (keine Fachlogik – die liegt im Core bzw. hinter der API). */
import { LANDKREISE, type Kategorie, type LandkreisKuerzel } from '@kirmes/core';
import type { TerminDto } from './api';

export { LANDKREISE };

/** Anzeige der Arten – so, wie Kirmesleute sie nennen (Issues #64, #135). */
export const KATEGORIEN: Record<Kategorie, { label: string; kurz: string }> = {
  party: { label: 'Kirmestanz/Kirmesdisco', kurz: 'Kirmestanz/Disco' },
  familie: { label: 'Kindertanz', kurz: 'Kindertanz' },
  tradition: { label: 'Gottesdienst/Frühschoppen', kurz: 'Gottesdienst/Frühschoppen' },
  staendchen: { label: 'Ständchen', kurz: 'Ständchen' },
};

/** Amtliche Bezeichnung und passende Präposition („im Landkreis Gotha“, „in Erfurt“). */
const KREIS_ANZEIGE: Record<LandkreisKuerzel, { name: string; in: string }> = {
  ABG: { name: 'Altenburger Land', in: 'im Altenburger Land' },
  EIC: { name: 'Landkreis Eichsfeld', in: 'im Eichsfeld' },
  GTH: { name: 'Landkreis Gotha', in: 'im Landkreis Gotha' },
  GRZ: { name: 'Landkreis Greiz', in: 'im Landkreis Greiz' },
  HBN: { name: 'Landkreis Hildburghausen', in: 'im Landkreis Hildburghausen' },
  IK: { name: 'Ilm-Kreis', in: 'im Ilm-Kreis' },
  KYF: { name: 'Kyffhäuserkreis', in: 'im Kyffhäuserkreis' },
  NDH: { name: 'Landkreis Nordhausen', in: 'im Landkreis Nordhausen' },
  SHK: { name: 'Saale-Holzland-Kreis', in: 'im Saale-Holzland-Kreis' },
  SOK: { name: 'Saale-Orla-Kreis', in: 'im Saale-Orla-Kreis' },
  SLF: { name: 'Landkreis Saalfeld-Rudolstadt', in: 'im Landkreis Saalfeld-Rudolstadt' },
  SM: { name: 'Landkreis Schmalkalden-Meiningen', in: 'im Landkreis Schmalkalden-Meiningen' },
  SÖM: { name: 'Landkreis Sömmerda', in: 'im Landkreis Sömmerda' },
  SON: { name: 'Landkreis Sonneberg', in: 'im Landkreis Sonneberg' },
  UH: { name: 'Unstrut-Hainich-Kreis', in: 'im Unstrut-Hainich-Kreis' },
  WAK: { name: 'Wartburgkreis', in: 'im Wartburgkreis' },
  WL: { name: 'Weimarer Land', in: 'im Weimarer Land' },
  EF: { name: 'Erfurt', in: 'in Erfurt' },
  G: { name: 'Gera', in: 'in Gera' },
  J: { name: 'Jena', in: 'in Jena' },
  SHL: { name: 'Suhl', in: 'in Suhl' },
  WE: { name: 'Weimar', in: 'in Weimar' },
  EA: { name: 'Eisenach', in: 'in Eisenach' },
};

export const kreisName = (k: LandkreisKuerzel) => KREIS_ANZEIGE[k]?.name ?? LANDKREISE[k];
export const imKreis = (k: LandkreisKuerzel) => KREIS_ANZEIGE[k]?.in ?? `im ${LANDKREISE[k]}`;
/** Kurzname für Sortierung und Kacheln („Gotha“ statt „Landkreis Gotha“) */
export const kreisKurz = (k: LandkreisKuerzel) => LANDKREISE[k];

/** URL-Segment je Landkreis: „SÖM“ → „soem“ */
export const kreisSlug = (k: string) =>
  k.toLowerCase().replace('ö', 'oe').replace('ä', 'ae').replace('ü', 'ue');

export const kreisAusSlug = (slug: string): LandkreisKuerzel | undefined =>
  (Object.keys(LANDKREISE) as LandkreisKuerzel[]).find((k) => kreisSlug(k) === slug);

/** „1 Termin“, „3 Termine“, „kein Termin“ */
/** „12 kommende Termine in 5 Orten.“ – grammatisch richtig auch für 0 und 1 (Issue #53). */
export function kreisZusammenfassung(termine: number, orte: number): string {
  if (termine === 0) return 'Noch keine kommenden Termine eingetragen.';
  const t =
    termine === 1 ? '1 kommender Termin' : `${termine.toLocaleString('de-DE')} kommende Termine`;
  const o = orte === 1 ? 'einem Ort' : `${orte.toLocaleString('de-DE')} Orten`;
  return `${t} in ${o}.`;
}

/** Pfad ohne abschließenden „/“ (außer „/“) – vorgerenderte Seiten kommen sonst mit „/“ an (#54). */
export const ohneSchraegstrich = (pfad: string) =>
  pfad.length > 1 ? pfad.replace(/\/+$/, '') : pfad;

export const anzahl = (
  n: number,
  einzahl: string,
  mehrzahl: string,
  keiner = `keine ${mehrzahl}`,
) => (n === 0 ? keiner : `${n.toLocaleString('de-DE')} ${n === 1 ? einzahl : mehrzahl}`);

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { ...o, timeZone: 'UTC' });
const fmtMonat = fmt({ month: 'long', year: 'numeric' });
const fmtLang = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtLangJahr = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTag = fmt({ day: 'numeric', month: 'long' });
const fmtWochentag = fmt({ weekday: 'long' });
const fmtKurz = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' });

export const monatName = (iso: string) => fmtMonat.format(new Date(iso));
export const datumLang = (iso: string) => fmtLang.format(new Date(iso));
export const datumLangJahr = (iso: string) => fmtLangJahr.format(new Date(iso));
export const tagMonat = (iso: string) => fmtTag.format(new Date(iso));
export const wochentag = (iso: string) => fmtWochentag.format(new Date(iso));
/** „Do., 15.10.“ – kompakt für Programmzeilen; ungültige Daten bleiben leer. */
export const datumKurz = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso))
    ? fmtKurz.format(new Date(iso))
    : '';

/** Heute in Thüringer Ortszeit (YYYY-MM-DD) – auch im Browser und auf Servern mit UTC. */
export const heute = (jetzt: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt);

export const plusTage = (iso: string, tage: number) =>
  new Date(Date.parse(iso) + tage * 86_400_000).toISOString().slice(0, 10);

/** Nächstes (bzw. laufendes) Wochenende Freitag–Sonntag. */
export function wochenende(h = heute()): { von: string; bis: string } {
  const tag = new Date(h).getUTCDay(); // 0 = So
  const freitag = plusTage(h, tag === 0 ? -2 : tag === 6 ? -1 : 5 - tag);
  return { von: freitag < h ? h : freitag, bis: plusTage(freitag, 2) };
}

/** „heute“, „morgen“ oder nichts – für Terminlisten. */
export function relativerTag(iso: string, h = heute()): string | null {
  if (iso === h) return 'heute';
  if (iso === plusTage(h, 1)) return 'morgen';
  return null;
}

/**
 * Routen-Links: Mit hinterlegtem Festplatz exakt, sonst über die Adresse
 * („Festzelt, Mühlberg, Thüringen“) – das finden beide Kartendienste zuverlässig.
 */
export function routenLinks(t: Pick<TerminDto, 'festplatz' | 'veranstaltungsort' | 'ort'>) {
  const ziel = t.festplatz
    ? `${t.festplatz.lat},${t.festplatz.lon}`
    : [t.veranstaltungsort, t.ort.name, 'Thüringen'].filter(Boolean).join(', ');
  const z = encodeURIComponent(ziel);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${z}`,
    apple: `https://maps.apple.com/?daddr=${z}&dirflg=d`,
    exakt: Boolean(t.festplatz),
  };
}

/** schema.org Event für Google-Rich-Results */
export function eventJsonLd(t: TerminDto, site: URL) {
  const geo = t.festplatz ?? t.ort.koordinate;
  return {
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
      ...(geo && { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lon } }),
    },
    ...(t.band && { performer: { '@type': 'MusicGroup', name: t.band } }),
    ...(t.info && { description: t.info }),
    url: new URL(`/termin/${t.id}`, site).href,
  };
}

/** 950 → „9,50 €“ (Mittagstisch, Issue #66) */
export const preisText = (cent: number) =>
  (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** Gericht als Textzeile: „Rostbrätel mit Brot – 7,50 €“ */
export const speiseZeile = (s: { name: string; preisCent: number | null }) =>
  s.preisCent == null ? s.name : `${s.name} – ${preisText(s.preisCent)}`;

export type ZeitAuswahl = 'kommend' | 'wochenende' | 'jahr' | 'vergangen' | 'alle';

/**
 * Zeitraum der Terminsuche (Issue #68). Mit Suchbegriff ohne gewählten Zeitraum: ein Jahr zurück
 * bis ein Jahr voraus – sonst fände die Suche vergangene Kirmesse nicht. Eine Jahreszahl im
 * Suchbegriff („2026“, „26“) grenzt auf dieses Jahr ein und wird nicht als Text gesucht.
 */
export function suchZeitraum(
  e: { q: string; zeit: string | null; von: string | null },
  h: string,
): { zeit: ZeitAuswahl; von: string; bis?: string; text: string } {
  const m = /(?:^|\s)(20[2-3]\d|[2-3]\d)(?=\s|$)/.exec(e.q);
  const treffer = m?.[1];
  const jahr = treffer ? (treffer.length === 2 ? `20${treffer}` : treffer) : null;
  const text = m ? e.q.replace(m[0], ' ').replace(/\s+/g, ' ').trim() : e.q.trim();
  const zeit: ZeitAuswahl = (
    ['kommend', 'wochenende', 'jahr', 'vergangen', 'alle'] as const
  ).includes(e.zeit as ZeitAuswahl)
    ? (e.zeit as ZeitAuswahl)
    : e.q.trim()
      ? 'alle'
      : 'kommend';
  if (jahr && (zeit === 'alle' || zeit === 'jahr')) {
    return { zeit: 'jahr', von: `${jahr}-01-01`, bis: `${jahr}-12-31`, text };
  }
  switch (zeit) {
    case 'wochenende':
      return { zeit, ...wochenende(h), text };
    case 'jahr':
      return { zeit, von: `${h.slice(0, 4)}-01-01`, bis: `${h.slice(0, 4)}-12-31`, text };
    case 'vergangen':
      return { zeit, von: plusTage(h, -365), bis: plusTage(h, -1), text };
    case 'alle':
      return { zeit, von: plusTage(h, -365), bis: plusTage(h, 365), text };
    default:
      return { zeit, von: e.von ?? h, text };
  }
}
