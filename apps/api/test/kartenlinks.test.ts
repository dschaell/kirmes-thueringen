/** Kurzlinks von Google Maps sicher auflösen (Issue #62) – ohne Netz, mit Weiterleitungs-Fakes. */
import { describe, expect, it } from 'vitest';
import { GoogleKartenlinks } from '../src/infrastructure/kartenlinks.js';

/** Fake-fetch: Tabelle Adresse → Weiterleitungsziel; protokolliert alle Abrufe. */
function netz(weiter: Record<string, string | null>, fehler = false) {
  const abgerufen: string[] = [];
  const holen = async (url: URL, init: RequestInit) => {
    abgerufen.push(url.href);
    expect(init.redirect).toBe('manual'); // nie automatisch folgen
    if (fehler) throw new Error('offline');
    const ziel = weiter[url.href];
    return new Response(
      null,
      ziel ? { status: 302, headers: { location: ziel } } : { status: 200 },
    );
  };
  return { holen, abgerufen };
}

describe('GoogleKartenlinks', () => {
  it('folgt Weiterleitungen von maps.app.goo.gl zu Google Maps mit Pin', async () => {
    const { holen, abgerufen } = netz({
      'https://maps.app.goo.gl/Abc':
        'https://www.google.com/maps/place/Kirche/data=!3d50.847493!4d11.041234',
    });
    expect(await new GoogleKartenlinks(holen).aufloesen('https://maps.app.goo.gl/Abc')).toBe(
      'https://www.google.com/maps/place/Kirche/data=!3d50.847493!4d11.041234',
    );
    expect(abgerufen).toEqual(['https://maps.app.goo.gl/Abc']);
  });

  it('liest das Ziel aus der EU-Einwilligungsseite (kodiert)', async () => {
    const { holen } = netz({
      'https://maps.app.goo.gl/Abc':
        'https://consent.google.com/m?continue=https://www.google.com/maps/place/X/%4050.85,11.04,17z',
    });
    expect(await new GoogleKartenlinks(holen).aufloesen('https://maps.app.goo.gl/Abc')).toContain(
      '@50.85,11.04',
    );
  });

  it('SSRF-Schutz: nie zu fremden Hosts, nie ohne HTTPS', async () => {
    const intern = netz({
      'https://maps.app.goo.gl/Abc': 'http://169.254.169.254/latest/meta-data',
    });
    expect(
      await new GoogleKartenlinks(intern.holen).aufloesen('https://maps.app.goo.gl/Abc'),
    ).toBeNull();
    expect(intern.abgerufen).toEqual(['https://maps.app.goo.gl/Abc']); // interne Adresse nie abgerufen
    const fremd = netz({ 'https://maps.app.goo.gl/Abc': 'https://evil.example/@50.8,11.0,' });
    expect(
      await new GoogleKartenlinks(fremd.holen).aufloesen('https://maps.app.goo.gl/Abc'),
    ).toBeNull();
    const direkt = netz({});
    expect(
      await new GoogleKartenlinks(direkt.holen).aufloesen('https://evil.example/x'),
    ).toBeNull();
    expect(
      await new GoogleKartenlinks(direkt.holen).aufloesen('http://maps.app.goo.gl/Abc'),
    ).toBeNull();
    expect(direkt.abgerufen).toEqual([]);
  });

  it('bricht Weiterleitungsschleifen ab und verkraftet Netzfehler', async () => {
    const schleife = netz({
      'https://maps.app.goo.gl/A': 'https://maps.app.goo.gl/B',
      'https://maps.app.goo.gl/B': 'https://maps.app.goo.gl/A',
    });
    expect(
      await new GoogleKartenlinks(schleife.holen, 3).aufloesen('https://maps.app.goo.gl/A'),
    ).toBeNull();
    expect(schleife.abgerufen).toHaveLength(3);
    expect(
      await new GoogleKartenlinks(netz({}, true).holen).aufloesen('https://maps.app.goo.gl/A'),
    ).toBeNull();
    // keine Weiterleitung und keine Koordinaten
    expect(
      await new GoogleKartenlinks(netz({}).holen).aufloesen('https://maps.app.goo.gl/A'),
    ).toBeNull();
    expect(await new GoogleKartenlinks(netz({}).holen).aufloesen('kein link')).toBeNull();
  });

  it('bricht den Inhalt jeder Antwort ab, statt ihn zu lesen', async () => {
    let abgebrochen = false;
    const holen = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            abgebrochen = true;
          },
        }),
        { status: 302, headers: { location: 'https://www.google.com/maps/@50.85,11.04,17z' } },
      );
    expect(await new GoogleKartenlinks(holen).aufloesen('https://maps.app.goo.gl/A')).toContain(
      '@50.85,11.04',
    );
    expect(abgebrochen).toBe(true);
  });

  it('ein Fehler beim Abbrechen des Inhalts stört nicht', async () => {
    const holen = async () => {
      const r = new Response(null, {
        status: 302,
        headers: { location: 'https://www.google.com/maps/@50.85,11.04,17z' },
      });
      Object.defineProperty(r, 'body', {
        value: { cancel: () => Promise.reject(new Error('schon zu')) },
      });
      return r;
    };
    expect(await new GoogleKartenlinks(holen).aufloesen('https://maps.app.goo.gl/A')).toContain(
      '@50.85,11.04',
    );
  });

  it('ungültiges Weiterleitungsziel → null', async () => {
    const holen = async () =>
      new Response(null, { status: 302, headers: { location: 'http://[kaputt' } });
    expect(await new GoogleKartenlinks(holen).aufloesen('https://maps.app.goo.gl/A')).toBeNull();
  });
});
