/** iCalendar (RFC 5545) für Kalender-Abo und Einzeltermine. */
import { dauerMinuten, eigenerPlatz, speiseZeile } from './anzeige';
import type { TerminDto } from './api';

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

const kodierer = new TextEncoder();
/** Zeilen nach RFC 5545 höchstens 75 Oktette lang – Umlaute zählen doppelt (Issue #108). */
export function falte(zeile: string): string {
  const teile: string[] = [];
  let aktuell = '';
  let bytes = 0;
  for (const z of zeile) {
    const n = kodierer.encode(z).length;
    // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt
    if (bytes + n > (teile.length ? 74 : 75)) {
      teile.push(aktuell);
      aktuell = '';
      bytes = 0;
    }
    aktuell += z;
    bytes += n;
  }
  teile.push(aktuell);
  return teile.join('\r\n ');
}

/** Europe/Berlin mit Sommer-/Winterzeit – ohne diesen Block ist TZID ungültig (Outlook). */
const ZEITZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'X-LIC-LOCATION:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Übliche Dauer je Art, damit Termine im Kalender nicht als 0-Minuten-Einträge erscheinen */
const DAUER: Record<string, string> = {
  tanz: 'PT5H',
  party: 'PT5H',
  familie: 'PT3H',
  tradition: 'PT2H',
  fruehschoppen: 'PT3H',
  staendchen: 'PT4H',
  sonstiges: 'PT3H',
};
const naechsterTag = (d: string) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

const alsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

export function alsIcal(termine: TerminDto[], site: URL | undefined, kalendername: string): string {
  const stempel = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kirmeskalender Thüringen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(kalendername)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...ZEITZONE,
  ];
  for (const t of termine) {
    const d = t.datum.replace(/-/g, '');
    // Änderungszeitpunkt (Issue #139): stabiler DTSTAMP, LAST-MODIFIED und eine SEQUENCE, die mit
    // jeder Änderung steigt (Minuten seit 1970) – so erkennen auch Outlook/Thunderbird Änderungen.
    const geaendert = t.geaendertAm ? Date.parse(t.geaendertAm) : NaN;
    const zeit = Number.isNaN(geaendert) ? stempel : alsUtc(geaendert);
    const sequenz = Number.isNaN(geaendert) ? 0 : Math.floor(geaendert / 60_000) - 28_000_000;
    const geo = t.festplatz ?? t.ort.koordinate;
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@kirmeskalender-thueringen.de`,
      `DTSTAMP:${zeit}`,
      `LAST-MODIFIED:${zeit}`,
      `SEQUENCE:${Math.max(0, sequenz)}`,
      ...(t.beginn
        ? [
            `DTSTART;TZID=Europe/Berlin:${d}T${t.beginn.replace(':', '')}00`,
            // Echte Endzeit (Issue #286), sonst übliche Dauer der Art
            `DURATION:${t.ende ? `PT${dauerMinuten(t)}M` : (DAUER[t.kategorie] ?? 'PT3H')}`,
          ]
        : [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${naechsterTag(t.datum)}`]),
      `SUMMARY:${esc(`${t.titel} – ${t.ort.name}`)}`,
      `LOCATION:${esc([eigenerPlatz(t), t.ort.name, 'Thüringen'].filter(Boolean).join(', '))}`,
      ...(geo ? [`GEO:${geo.lat};${geo.lon}`] : []),
      `DESCRIPTION:${esc(
        [
          t.band && `Musik: ${t.band}`,
          t.pfarrer && `Pfarrer/in: ${t.pfarrer}`,
          t.info,
          t.speisen?.length ? `Essen & Getränke:\n${t.speisen.map(speiseZeile).join('\n')}` : null,
          (t.bestaetigt ? '' : 'Noch nicht vom Veranstalter bestätigt. ') + 'Angaben ohne Gewähr.',
        ]
          .filter(Boolean)
          .join('\n'),
      )}`,
      `URL:${new URL(`/termin/${t.id}`, site ?? 'http://localhost').href}`,
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.map(falte).join('\r\n');
}
