import type { APIRoute } from 'astro';
import { alleTermine } from '../lib/api';
import { heute } from '../lib/anzeige';

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const fold = (line: string) => (line.match(/.{1,73}/gu) ?? ['']).join('\r\n ');

export const GET: APIRoute = async ({ site }) => {
  const termine = await alleTermine({ von: heute() });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kirmeskalender Thüringen//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Kirmeskalender Thüringen',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];
  for (const t of termine) {
    const d = t.datum.replace(/-/g, '');
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@kirmeskalender-thueringen.de`,
      `DTSTAMP:${stamp}`,
      t.beginn
        ? `DTSTART;TZID=Europe/Berlin:${d}T${t.beginn.replace(':', '')}00`
        : `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${esc(`${t.titel} – ${t.ort.name}`)}`,
      `LOCATION:${esc([t.veranstaltungsort, t.ort.name, 'Thüringen'].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${esc((t.bestaetigt ? '' : 'Unbestätigt – bitte beim Veranstalter prüfen. ') + 'Angaben ohne Gewähr.')}`,
      `URL:${new URL(`/orte/${t.ort.slug}`, site).href}`,
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return new Response(zeilen.map(fold).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
