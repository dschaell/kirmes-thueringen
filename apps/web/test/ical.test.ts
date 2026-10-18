import { describe, expect, it } from 'vitest';
import { alsIcal, falte } from '../src/lib/ical';
import type { TerminDto } from '../src/lib/api';

const t = (x: Partial<TerminDto> = {}): TerminDto => ({
  id: '837e5b5e-4ce6-41bf-9fe2-d4ee50554823',
  datum: '2026-10-18',
  beginn: '10:00',
  titel: 'Frühschoppen',
  veranstaltungsort: null,
  kategorie: 'tradition',
  bestaetigt: true,
  ort: { slug: 'alkersleben', name: 'Alkersleben', landkreis: 'IK', koordinate: null },
  festplatz: null,
  band: null,
  info: null,
  muttizettel: false,
  ...x,
});
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('iCalendar (Issue #108)', () => {
  it('faltet nach Oktetten – auch mit Umlauten nie über 75', () => {
    const lang = 'DESCRIPTION:' + 'Gulaschsuppe mit Brötchen für Kirmesgäste – öäüß '.repeat(6);
    const z = falte(lang).split('\r\n');
    expect(z.length).toBeGreaterThan(1);
    for (const zeile of z) expect(bytes(zeile)).toBeLessThanOrEqual(75);
    expect(z.slice(1).every((x) => x.startsWith(' '))).toBe(true);
    expect(z.map((x, i) => (i ? x.slice(1) : x)).join('')).toBe(lang);
  });
  it('enthält VTIMEZONE und Dauer je Art; ganztägig mit DTEND', () => {
    const ics = alsIcal(
      [t(), t({ kategorie: 'party', id: 'b' }), t({ beginn: null, id: 'c' })],
      new URL('https://example.org'),
      'Kirmes im Ilm-Kreis',
    );
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261018T100000\r\nDURATION:PT2H');
    expect(ics).toContain('DURATION:PT5H');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261018\r\nDTEND;VALUE=DATE:20261019');
    expect(ics).toContain('X-WR-CALNAME:Kirmes im Ilm-Kreis');
    for (const z of ics.split('\r\n')) expect(bytes(z)).toBeLessThanOrEqual(75);
  });
});
