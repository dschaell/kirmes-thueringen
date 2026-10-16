/** iCalendar (RFC 5545) für Kalender-Abo und Einzeltermine. */
import { speiseZeile } from './anzeige';
import type { TerminDto } from './api';

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const falte = (zeile: string) => (zeile.match(/.{1,73}/gu) ?? ['']).join('\r\n ');

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
  ];
  for (const t of termine) {
    const d = t.datum.replace(/-/g, '');
    const geo = t.festplatz ?? t.ort.koordinate;
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@kirmeskalender-thueringen.de`,
      `DTSTAMP:${stempel}`,
      t.beginn
        ? `DTSTART;TZID=Europe/Berlin:${d}T${t.beginn.replace(':', '')}00`
        : `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${esc(`${t.titel} – ${t.ort.name}`)}`,
      `LOCATION:${esc([t.veranstaltungsort, t.ort.name, 'Thüringen'].filter(Boolean).join(', '))}`,
      ...(geo ? [`GEO:${geo.lat};${geo.lon}`] : []),
      `DESCRIPTION:${esc(
        [
          t.band && `Musik: ${t.band}`,
          t.info,
          t.speisen?.length ? `Mittagstisch:\n${t.speisen.map(speiseZeile).join('\n')}` : null,
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
