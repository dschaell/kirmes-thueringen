import { describe, expect, it } from 'vitest';
import { groesse, sicherungsZeile, type SicherungsStand } from '../src/lib/sicherungen';

const jetzt = new Date('2026-10-19T12:00:00Z');
const stand = (s: Partial<NonNullable<SicherungsStand['status']>> = {}): SicherungsStand => ({
  status: {
    zeit: '2026-10-19T01:00:00Z',
    lokal: 'ok',
    datei: 'kirmes-2026-10-19.dump',
    groesse: 2_500_000,
    offsite: 'aus',
    meldung: '',
    ...s,
  },
  dateien: [],
});

describe('sicherungsZeile', () => {
  it('frische Sicherung ohne Warnung', () => {
    expect(sicherungsZeile(stand(), jetzt)).toEqual({
      text: 'Letzte Sicherung: 19.10., 03:00 Uhr (2,4 MB).',
      warnung: false,
    });
    expect(sicherungsZeile(stand({ offsite: 'ok' }), jetzt).text).toContain(
      'auch extern gespeichert',
    );
  });
  it('warnt bei fehlendem Status, Fehler, Offsite-Fehler und Alter > 36 h', () => {
    expect(sicherungsZeile({ status: null, dateien: [] }, jetzt).warnung).toBe(true);
    const f = sicherungsZeile(stand({ lokal: 'fehler', meldung: 'pg_dump fehlgeschlagen' }), jetzt);
    expect(f).toEqual({
      text: expect.stringContaining('fehlgeschlagen: pg_dump fehlgeschlagen'),
      warnung: true,
    });
    expect(sicherungsZeile(stand({ lokal: 'fehler' }), jetzt).text).toMatch(/fehlgeschlagen\.$/);
    expect(sicherungsZeile(stand({ offsite: 'fehler', meldung: 'Upload' }), jetzt)).toEqual({
      text: expect.stringContaining('externe Kopie fehlgeschlagen: Upload'),
      warnung: true,
    });
    expect(sicherungsZeile(stand({ offsite: 'fehler' }), jetzt).text).toContain(
      'externe Kopie fehlgeschlagen.',
    );
    const alt = sicherungsZeile(stand({ zeit: '2026-10-17T12:00:00Z' }), jetzt);
    expect(alt.warnung).toBe(true);
    expect(alt.text).toContain('älter als 36 Stunden');
  });
  it('Größe lesbar', () => {
    expect(groesse(10)).toBe('1 kB');
    expect(groesse(300_000)).toBe('293 kB');
  });
});
