/** Darstellungs-Helfer des Frontends (keine Fachlogik – die liegt im Core bzw. hinter der API). */
import { bandsAus, LANDKREISE, type Kategorie, type LandkreisKuerzel } from '@kirmes/core';
import type { TerminDto } from './api';

export { LANDKREISE };

/** Anzeige der Arten – so, wie Kirmesleute sie nennen (Issues #64, #135, #147, #154, #223). */
/** „A, B, C“ → „A, B und C“ für Fließtext (Issue #324) */
export const bandText = (band: string | null | undefined) =>
  bandsAus(band)
    .join(', ')
    .replace(/, ([^,]*)$/, ' und $1');

export { bandsAus };

export const KATEGORIEN: Record<Kategorie, { label: string; kurz: string }> = {
  tanz: { label: 'Kirmestanz', kurz: 'Kirmestanz' },
  party: { label: 'Party/Disco', kurz: 'Party/Disco' },
  familie: { label: 'Kindertanz', kurz: 'Kindertanz' },
  tradition: { label: 'Gottesdienst', kurz: 'Gottesdienst' },
  fruehschoppen: { label: 'Frühschoppen', kurz: 'Frühschoppen' },
  staendchen: { label: 'Ständchen', kurz: 'Ständchen' },
  sonstiges: { label: 'Sonstiges', kurz: 'Sonstiges' },
};

/** Beschriftung des Musik-Felds je Art – beim Gottesdienst Chor statt Band (Issue #175). */
export const musikFeld = (kategorie: string | null | undefined) =>
  kategorie === 'tradition' ? 'Chor / Gesang / musikalische Begleitung' : 'Band / DJ';

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
const fmtKurzJahr = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

export const monatName = (iso: string) => fmtMonat.format(new Date(iso));
export const datumLang = (iso: string) => fmtLang.format(new Date(iso));
export const datumLangJahr = (iso: string) => fmtLangJahr.format(new Date(iso));
export const tagMonat = (iso: string) => fmtTag.format(new Date(iso));
export const wochentag = (iso: string) => fmtWochentag.format(new Date(iso));
/**
 * „Do., 15.10.“ – kompakt für Programmzeilen; ungültige Daten bleiben leer. Mit `aktuellesJahr`
 * kommt das Jahr dazu, wenn das Datum in einem anderen Jahr liegt: „Do., 21.10.2027“ (Issue #209).
 */
export const datumKurz = (iso: string, aktuellesJahr?: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso))
    ? (aktuellesJahr && !iso.startsWith(aktuellesJahr) ? fmtKurzJahr : fmtKurz).format(
        new Date(iso),
      )
    : '';

/** Heute in Thüringer Ortszeit (YYYY-MM-DD) – auch im Browser und auf Servern mit UTC. */
export const heute = (jetzt: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt);

export const plusTage = (iso: string, tage: number) =>
  new Date(Date.parse(iso) + tage * 86_400_000).toISOString().slice(0, 10);

/** Nächstes (bzw. laufendes) Wochenende Freitag–Sonntag. */
/** „31.10.–2.11.“ – kurzer Zeitraum für Titel (Issue #305) */
export const zeitraumKurz = (von: string, bis: string) => {
  const kurz = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`;
  return von === bis ? kurz(von) : `${kurz(von)}–${kurz(bis)}`;
};

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

type PlatzAngabe = {
  veranstaltungsort: string | null;
  kategorie?: string;
  ort: { name: string };
};

/**
 * Eingetragener Platz – außer bei Ständchen ohne eigenen Platz (Issue #213): Die ziehen durch den
 * ganzen Ort, daher zählen leer, der Ortsname und „… (ganzer Ort)“ nicht als Platz.
 */
export function eigenerPlatz(t: PlatzAngabe): string | null {
  const v = t.veranstaltungsort?.trim() || null;
  if (!v || t.kategorie !== 'staendchen') return v;
  const ohneZusatz = v.replace(/\s*\(?ganzer ort\)?$/i, '').trim();
  return ohneZusatz === '' || ohneZusatz === t.ort.name ? null : v;
}

/** Platz für die Anzeige: Ständchen ohne eigenen Platz → „ganzer Ort“. */
export const platzText = (t: PlatzAngabe): string | null =>
  eigenerPlatz(t) ?? (t.kategorie === 'staendchen' ? 'ganzer Ort' : null);

/**
 * Routen-Links (Issue #179): nur wohin man sich verlassen kann.
 * - hinterlegter Platz → genau dorthin („genau“)
 * - kein „Wo genau?“ → Ortsmitte (Koordinate, sonst Ortsname) („ort“)
 * - nur ein Text wie „Sportplatz“ ohne Kartenpunkt → keine Route (Suche wäre beliebig)
 */
export function routenLinks(
  t: Pick<TerminDto, 'festplatz' | 'veranstaltungsort' | 'ort'> & { kategorie?: string },
): { google: string; apple: string; art: 'genau' | 'ort' } | null {
  const platz = eigenerPlatz(t);
  const k = t.festplatz ?? (platz ? null : t.ort.koordinate);
  if (!k && platz) return null;
  const ziel = k ? `${k.lat},${k.lon}` : `${t.ort.name}, Thüringen`;
  const z = encodeURIComponent(ziel);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${z}`,
    apple: `https://maps.apple.com/?daddr=${z}&dirflg=d`,
    art: t.festplatz ? 'genau' : 'ort',
  };
}

/** schema.org Event für Google-Rich-Results */
/** Übliche Dauer je Art in Stunden – für Kalender-Abo und Suchmaschinen (Ende fehlt meist). */
export const DAUER_STUNDEN: Record<string, number> = {
  tanz: 5,
  party: 5,
  familie: 3,
  tradition: 2,
  fruehschoppen: 3,
  staendchen: 4,
  sonstiges: 3,
};

/** Zeitzonen-Versatz in Thüringen an einem Tag: „+02:00“ (Sommer) bzw. „+01:00“. */
export function berlinVersatz(datum: string): string {
  const teil = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(`${datum}T12:00:00Z`))
    .find((x) => x.type === 'timeZoneName')?.value;
  return teil === 'GMT+2' ? '+02:00' : '+01:00';
}

/** Ortszeit + Minuten → „2026-10-24T01:00:00+02:00“ (über Mitternacht korrekt). */
function plusMinuten(datum: string, beginn: string, minuten: number): string {
  const [h = 0, m = 0] = beginn.split(':').map(Number);
  const d = new Date(
    Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10), h, m + minuten),
  );
  const tag = d.toISOString().slice(0, 10);
  return `${tag}T${d.toISOString().slice(11, 16)}:00${berlinVersatz(tag)}`;
}

/**
 * schema.org Event für Google-Rich-Results (Issue #182): mit Zeitzone, Ende, Beschreibung und
 * Bild – sonst meldet Google fehlende empfohlene Felder.
 */
export function eventJsonLd(t: TerminDto, site: URL) {
  const geo = t.festplatz ?? t.ort.koordinate;
  const url = new URL(`/termin/${t.id}`, site).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${t.titel} – ${t.ort.name}`,
    startDate: t.beginn ? `${t.datum}T${t.beginn}:00${berlinVersatz(t.datum)}` : t.datum,
    endDate: t.beginn ? plusMinuten(t.datum, t.beginn, dauerMinuten(t)) : t.datum,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: t.veranstaltungsort ? `${t.veranstaltungsort}, ${t.ort.name}` : t.ort.name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: t.ort.name,
        addressRegion: 'Thüringen',
        addressCountry: 'DE',
      },
      ...(geo && { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lon } }),
    },
    ...(t.band && {
      performer: bandsAus(t.band).map((name) => ({ '@type': 'MusicGroup', name })),
    }),
    ...(veranstalterVon(t) && { organizer: { '@type': 'Organization', name: veranstalterVon(t) } }),
    ...(t.eintrittCent != null && {
      offers: {
        '@type': 'Offer',
        price: (t.eintrittCent / 100).toFixed(2),
        priceCurrency: 'EUR',
        url,
      },
    }),
    description:
      t.info ??
      `${artName(t.kategorie)} in ${t.ort.name} am ${datumLang(t.datum)}${t.beginn ? ` ab ${t.beginn} Uhr` : ''}${t.band ? ` mit ${bandText(t.band)}` : ''}.`,
    // Echtes Plakat bevorzugt (Issue #297), sonst das erzeugte Vorschaubild
    image: [
      ...(t.plakat ? [new URL(plakatPfad(t.id, t.plakat, 'gross'), site).href] : []),
      new URL(`/termin/${t.id}/bild.png`, site).href,
    ],
    url,
  };
}

const minutenVon = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Dauer ab Beginn (Issue #286): echte Endzeit – davor liegend = nach Mitternacht –, sonst übliche
 * Dauer der Art.
 */
export function dauerMinuten(t: Pick<TerminDto, 'beginn' | 'ende' | 'kategorie'>): number {
  if (!t.beginn || !t.ende || t.ende === t.beginn) return (DAUER_STUNDEN[t.kategorie] ?? 3) * 60;
  const d = minutenVon(t.ende) - minutenVon(t.beginn);
  return d > 0 ? d : d + 24 * 60;
}

/** „20:00“, mit Endzeit „10:00–12:00“; null ohne Beginn */
export const uhrzeitText = (t: { beginn?: string | null; ende?: string | null }): string | null =>
  t.beginn ? (t.ende && t.ende !== t.beginn ? `${t.beginn}–${t.ende}` : t.beginn) : null;

/** Bildadresse eines Plakats (Issue #297); der Stand macht sie bei jedem neuen Bild neu. */
export const plakatPfad = (id: string, stand: string, groesse: 'gross' | 'klein') =>
  `/termin/${id}/plakat/${groesse}.webp?v=${encodeURIComponent(stand)}`;

/** Luftlinie in km (Haversine) – für „In meiner Nähe“ (Issue #296). */
export function entfernungKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const UMKREISE = [10, 20, 50] as const;

/**
 * „50.92,11.03“ → Punkt, auf 2 Nachkommastellen (~1 km) gerundet: genauer braucht es niemand,
 * und so steht nie der genaue Standort in einer Adresse. Nur Thüringen und Umgebung.
 */
export function standortAus(text: string | null): { lat: number; lon: number } | null {
  const m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(text?.trim() ?? '');
  if (!m) return null;
  const lat = Math.round(Number(m[1]) * 100) / 100;
  const lon = Math.round(Number(m[2]) * 100) / 100;
  return lat >= 49 && lat <= 52.5 && lon >= 8.5 && lon <= 14 ? { lat, lon } : null;
}

/**
 * Wer veranstaltet (Issue #278): eigener Eintrag am Termin, sonst der selbst eingetragene Name der
 * Kirmesgesellschaft – nie geraten, sonst null.
 */
export const veranstalterVon = (t: Pick<TerminDto, 'veranstalter' | 'ort'>): string | null =>
  t.veranstalter ?? t.ort.kgName ?? null;

/** 0 → „frei“, 800 → „8 €“, 750 → „7,50 €“ */
export const eintrittText = (cent: number): string =>
  cent === 0
    ? 'frei'
    : `${(cent / 100).toLocaleString('de-DE', { minimumFractionDigits: cent % 100 ? 2 : 0 })} €`;

/** Brotkrumen für Suchmaschinen: Start › … › aktuelle Seite (Issue #182). */
export function brotkrumenJsonLd(stufen: [name: string, pfad: string][], site: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Kirmeskalender Thüringen', '/'] as const, ...stufen].map(
      ([name, pfad], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        item: new URL(pfad, site).href,
      }),
    ),
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

/** Name einer Art – unbekannte Werte (z. B. während eines Deploys) werden angezeigt statt abzustürzen. */
export const artName = (k: string, kurz = false): string => {
  const a = (KATEGORIEN as Record<string, { label: string; kurz: string } | undefined>)[k];
  return a ? (kurz ? a.kurz : a.label) : k;
};

/** Freiwillige Unterstützung des Kirmeskalenders (Issue #141) – nur ein Link, nichts wird geladen. */
export const UNTERSTUETZEN_URL = 'https://paypal.me/dustinschaellert';
