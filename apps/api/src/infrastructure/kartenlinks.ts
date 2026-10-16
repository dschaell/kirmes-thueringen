/**
 * Kurzlinks aus Google Maps („Teilen → Link kopieren“, maps.app.goo.gl/…) auflösen (Issue #62).
 * Schutz vor SSRF: nur HTTPS, nur Google-Hosts, höchstens 5 Weiterleitungen, kurze Zeitgrenze –
 * der Server folgt nie einer Adresse außerhalb von Google und lädt keine Inhalte.
 */
import type { Kartenlinks } from '@kirmes/core';

const ERLAUBT = /^(maps\.app\.goo\.gl|goo\.gl|((www|maps|consent)\.)?google\.(com|de))$/;
/** Enthält die Adresse schon Koordinaten (Pin, Suchparameter oder Kartenmitte)? */
const MIT_KOORDINATEN = /!3d-?\d|[?&](q|query|ll|daddr|destination)=-?\d|@-?\d+\.\d+,/;

type Holen = (url: URL, init: RequestInit) => Promise<Response>;

export class GoogleKartenlinks implements Kartenlinks {
  constructor(
    private readonly holen: Holen = fetch,
    private readonly maxSprung = 5,
  ) {}

  async aufloesen(kurzlink: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(kurzlink.trim());
    } catch {
      return null;
    }
    // Endet immer: spätestens nach maxSprung Weiterleitungen mit null
    for (let i = 0; ; i++) {
      if (url.protocol !== 'https:' || !ERLAUBT.test(url.hostname)) return null;
      // EU-Einwilligungsseite und Maps-URLs tragen das Ziel teils kodiert (%40, %213d)
      const lesbar = decodeURIComponent(url.href);
      if (MIT_KOORDINATEN.test(lesbar)) return lesbar;
      if (i === this.maxSprung) return null;
      let r: Response;
      try {
        r = await this.holen(url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
          headers: { 'user-agent': 'Kirmeskalender-Thueringen/1.0 (Standort aus Kartenlink)' },
        });
      } catch {
        return null;
      }
      // Inhalt nie lesen – nur die Weiterleitung zählt
      try {
        await r.body?.cancel();
      } catch {
        /* Abbruch des Inhalts darf scheitern */
      }
      const ziel = r.headers.get('location');
      if (!ziel) return null;
      try {
        url = new URL(ziel, url);
      } catch {
        return null;
      }
    }
  }
}
