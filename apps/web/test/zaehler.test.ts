import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { erstelleZaehler, meldeAnApi, zaehlpfad } from '../zaehler.mjs';

const anfrage = (url: string, ua = 'Mozilla/5.0 (iPhone)', method = 'GET') =>
  ({ url, method, headers: { 'user-agent': ua } }) as never;
const antwort = (status = 200, typ = 'text/html; charset=utf-8') => {
  const r = new EventEmitter() as EventEmitter & { statusCode: number; getHeader: () => string };
  r.statusCode = status;
  r.getHeader = () => typ;
  return r;
};

describe('Zugriffszahlen ohne Tracking (Issue #311)', () => {
  it('zählbare Pfade: ohne Abfrage, ohne Redaktion und Dateien', () => {
    expect(zaehlpfad('/orte/m%C3%BChlberg?x=1#a')).toBe('/orte/mühlberg');
    expect(zaehlpfad('/')).toBe('/');
    for (const p of [
      '/admin',
      '/admin/termine',
      '/api/v1/termine',
      '/_astro/a.js',
      '/og.png',
      '/kalender.ics',
      '/kacheln/1/2/3.png',
      '/x%ZZ',
      `/${'a'.repeat(201)}`,
      '/a b',
    ])
      expect(zaehlpfad(p), p).toBeNull();
  });
  it('zählt nur echte Seitenaufrufe und meldet Summen', async () => {
    const gemeldet: unknown[] = [];
    const z = erstelleZaehler({
      melde: async (a: unknown) => void gemeldet.push(a),
      intervallMs: 1e9,
    });
    const fall = (req: never, res: ReturnType<typeof antwort>) => {
      z.zaehle(req, res as never);
      res.emit('finish');
    };
    fall(anfrage('/termine?q=x'), antwort());
    fall(anfrage('/termine'), antwort());
    fall(anfrage('/orte/ulla'), antwort());
    fall(anfrage('/orte/ulla', 'Googlebot/2.1'), antwort());
    fall(anfrage('/orte/ulla', 'Mozilla/5.0 (compatible; bingbot/2.0)'), antwort());
    fall(anfrage('/orte/ulla', ''), antwort());
    fall(anfrage('/orte/ulla', 'x', 'POST'), antwort());
    fall(anfrage('/gibts-nicht'), antwort(404));
    fall(anfrage('/wochenbild'), antwort(200, 'image/png'));
    fall(anfrage('/admin'), antwort());
    await z.leere();
    await z.leere(); // leer: nichts zu melden
    z.stopp();
    expect(gemeldet).toEqual([
      [
        { pfad: '/termine', anzahl: 2 },
        { pfad: '/orte/ulla', anzahl: 1 },
      ],
    ]);
  });
  it('Meldefehler stören nicht; Meldung geht als JSON an die API', async () => {
    const z = erstelleZaehler({
      melde: async () => Promise.reject(new Error('weg')),
      intervallMs: 1e9,
    });
    const res = antwort();
    z.zaehle(anfrage('/'), res as never);
    res.emit('finish');
    await expect(z.leere()).resolves.toBeUndefined();
    z.stopp();
    const alt = globalThis.fetch;
    const rufe: [string, RequestInit][] = [];
    globalThis.fetch = (async (u: URL, i: RequestInit) => (
      rufe.push([String(u), i]),
      new Response()
    )) as never;
    try {
      await meldeAnApi('http://api:3100')([{ pfad: '/', anzahl: 3 }]);
    } finally {
      globalThis.fetch = alt;
    }
    expect(rufe[0]?.[0]).toBe('http://api:3100/api/v1/intern/aufrufe');
    expect(JSON.parse(String(rufe[0]?.[1].body))).toEqual({ aufrufe: [{ pfad: '/', anzahl: 3 }] });
  });
});
