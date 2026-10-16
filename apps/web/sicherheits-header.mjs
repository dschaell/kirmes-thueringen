/** Sicherheits-Header für jede Antwort der Website (OWASP A05). CSP ohne 'unsafe-inline'. */
const CSP = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self' data:",
  'connect-src': "'self'",
  'form-action': "'self' mailto:",
  'frame-ancestors': "'none'",
  'base-uri': "'self'",
  'object-src': "'none'",
};
const alsText = (csp) =>
  Object.entries(csp)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');

const BASIS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export const SICHERHEITS_HEADER = {
  ...BASIS,
  'Content-Security-Policy': alsText(CSP),
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Bearbeitungsseite: Kartenkacheln und Adresssuche von OpenStreetMap, Standort des Handys.
 * Ohne COEP, weil OSM-Kacheln keinen CORP-Header senden.
 */
export const SICHERHEITS_HEADER_VERWALTUNG = {
  ...BASIS,
  'Content-Security-Policy': alsText({
    ...CSP,
    'img-src': "'self' data: https://tile.openstreetmap.org",
    'connect-src': "'self' https://nominatim.openstreetmap.org",
  }),
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Cache-Control': 'no-store',
};

/** Kartenansicht: nur Kartenkacheln von OpenStreetMap zusätzlich; ohne COEP (Kacheln ohne CORP). */
export const SICHERHEITS_HEADER_KARTE = {
  ...BASIS,
  'Content-Security-Policy': alsText({
    ...CSP,
    'img-src': "'self' data: https://tile.openstreetmap.org",
  }),
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

export const headerFuer = (pfad) =>
  pfad.startsWith('/verwalten')
    ? SICHERHEITS_HEADER_VERWALTUNG
    : pfad === '/karte' || pfad.startsWith('/karte?')
      ? SICHERHEITS_HEADER_KARTE
      : SICHERHEITS_HEADER;
