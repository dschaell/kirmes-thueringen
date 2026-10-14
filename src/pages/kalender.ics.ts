import type { APIRoute } from 'astro';
import { termine } from '../lib/data';

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const fold = (line: string) => line.match(/.{1,73}/gu)!.join('\r\n ');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

export const GET: APIRoute = ({ site }) => {
  const zeilen = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kirmeskalender Thüringen//DE', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Kirmeskalender Thüringen', 'X-WR-TIMEZONE:Europe/Berlin',
  ];
  for (const t of termine) {
    if (!t.datum) continue;
    const d = t.datum.replace(/-/g, '');
    const start = t.zeit
      ? `DTSTART;TZID=Europe/Berlin:${d}T${t.zeit.replace(':', '').padStart(4, '0')}00`
      : `DTSTART;VALUE=DATE:${d}`;
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@kirmeskalender-thueringen.de`,
      `DTSTAMP:${stamp}`,
      start,
      `SUMMARY:${esc(`${t.titel} – ${t.ort}`)}`,
      `LOCATION:${esc([t.location, t.ort, 'Thüringen'].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${esc((t.bestaetigt ? '' : 'Unbestätigt – bitte beim Veranstalter prüfen. ') + 'Angaben ohne Gewähr.')}`,
      `URL:${new URL(`/orte/${t.ortSlug}`, site).href}`,
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return new Response(zeilen.map(fold).join('\r\n'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
