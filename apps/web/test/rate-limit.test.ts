import { describe, expect, it } from 'vitest';
import { clientIp, erstelleRateLimit, istIntern, ladeGrenzen } from '../rate-limit.mjs';

const anfrage = (url: string, ip: string, xff?: string, accept?: string) => ({
  url,
  socket: { remoteAddress: ip },
  headers: { ...(xff ? { 'x-forwarded-for': xff } : {}), ...(accept ? { accept } : {}) },
});
function antwort() {
  const r = {
    statusCode: 200,
    kopf: {} as Record<string, string>,
    text: '',
    setHeader(n: string, w: string) {
      r.kopf[n] = w;
    },
    end(t: string) {
      r.text = t;
    },
  };
  return r;
}

describe('Rate-Limit am öffentlichen Einstieg', () => {
  it('lässt normale Nutzung durch und sperrt danach mit 429 und Retry-After', () => {
    let t = 0;
    const begrenze = erstelleRateLimit({ max: 3, fensterMs: 60_000 }, () => t);
    const seiten = [1, 2, 3].map(() => begrenze(anfrage('/termine', '1.2.3.4'), antwort()));
    expect(seiten).toEqual([true, true, true]);
    const res = antwort();
    expect(begrenze(anfrage('/termine', '1.2.3.4'), res)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.kopf['Retry-After']).toBe('60');
    expect(res.kopf['Content-Type']).toBe('text/plain; charset=utf-8');
    // andere IP unbeeinträchtigt, nach Ablauf des Fensters wieder frei
    expect(begrenze(anfrage('/termine', '5.6.7.8'), antwort())).toBe(true);
    t = 60_001;
    expect(begrenze(anfrage('/termine', '1.2.3.4'), antwort())).toBe(true);
  });

  it('Browser bekommen eine gestaltete Seite, die nach der Sperre neu lädt (Issue #210)', () => {
    const begrenze = erstelleRateLimit({ max: 1, fensterMs: 30_000 }, () => 0);
    const html = 'text/html,application/xhtml+xml,*/*;q=0.8';
    begrenze(anfrage('/', '4.4.4.4', undefined, html), antwort());
    const res = antwort();
    expect(begrenze(anfrage('/', '4.4.4.4', undefined, html), res)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.kopf['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.kopf['Cache-Control']).toBe('no-store');
    expect(res.text).toContain('<meta http-equiv="refresh" content="30">');
    expect(res.text).toContain('href="/zu-viele-anfragen.css"');
    expect(res.text).not.toMatch(/<style|<script|style=/);
  });

  it('statische Dateien zählen nicht', () => {
    const begrenze = erstelleRateLimit({ max: 1, fensterMs: 60_000 });
    for (const url of [
      '/_astro/a.js',
      '/fonts/x.woff2',
      '/og.png',
      '/favicon.svg',
      '/robots.txt',
    ]) {
      expect(begrenze(anfrage(url, '9.9.9.9'), antwort())).toBe(true);
    }
    expect(begrenze(anfrage('/', '9.9.9.9'), antwort())).toBe(true);
    expect(begrenze(anfrage('/kalender.ics', '9.9.9.9'), antwort())).toBe(false);
  });

  it('vertraut X-Forwarded-For nur vom Proxy im internen Netz', () => {
    expect(clientIp(anfrage('/', '172.18.0.5', '203.0.113.7, 10.0.0.1'))).toBe('203.0.113.7');
    expect(clientIp(anfrage('/', '198.51.100.9', '203.0.113.7'))).toBe('198.51.100.9');
    expect(clientIp(anfrage('/', '10.0.0.2', 'kein-ip'))).toBe('10.0.0.2');
    expect([istIntern('::1'), istIntern('fd00::1'), istIntern('8.8.8.8'), istIntern('')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('Grenzwerte per Umgebung, sichere Standards', () => {
    expect(ladeGrenzen({})).toEqual({ max: 120, fensterMs: 60_000, aus: false });
    expect(ladeGrenzen({ RATE_LIMIT_MAX: '30', RATE_LIMIT_FENSTER_S: '10' })).toMatchObject({
      max: 30,
      fensterMs: 10_000,
    });
    expect(ladeGrenzen({ RATE_LIMIT_MAX: '-5', RATE_LIMIT_FENSTER_S: 'x' }).max).toBe(120);
    const aus = erstelleRateLimit({ max: 1, fensterMs: 1000, aus: true });
    expect([aus(anfrage('/', 'a'), antwort()), aus(anfrage('/', 'a'), antwort())]).toEqual([
      true,
      true,
    ]);
  });
});
