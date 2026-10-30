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
 * Bearbeitungsseite und Karte: Kacheln und Adresssuche kommen über den eigenen Server (Issue #103),
 * daher dieselbe strenge CSP samt COEP; zusätzlich darf die Seite nach Klick den Standort nutzen.
 */
export const SICHERHEITS_HEADER_VERWALTUNG = {
  ...SICHERHEITS_HEADER,
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Cache-Control': 'no-store',
};

export const SICHERHEITS_HEADER_KARTE = {
  ...SICHERHEITS_HEADER,
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

/**
 * Seiten mit Google-Maps-Karte (Terminseite, Termine der Redaktion): eingebettetes Kartenfenster von
 * maps.google.com – erst nach Klick (Einwilligung). Ohne COEP, weil Google keinen CORP-Header sendet.
 */
export const SICHERHEITS_HEADER_GOOGLE_KARTE = {
  ...BASIS,
  'Content-Security-Policy': alsText({
    ...CSP,
    'frame-src': 'https://maps.google.com https://www.google.com',
  }),
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

export const headerFuer = (pfad) =>
  pfad.startsWith('/verwalten')
    ? SICHERHEITS_HEADER_VERWALTUNG
    : // Karte und Terminsuche („In meiner Nähe“, Issue #296) dürfen nach Klick den Standort nutzen
      pfad === '/karte' ||
        pfad.startsWith('/karte?') ||
        pfad === '/termine' ||
        pfad.startsWith('/termine?')
      ? SICHERHEITS_HEADER_KARTE
      : /^\/termin\/[0-9a-f-]+(\?|$)/.test(pfad) ||
          pfad === '/admin/termine' ||
          pfad.startsWith('/admin/termine?')
        ? SICHERHEITS_HEADER_GOOGLE_KARTE
        : SICHERHEITS_HEADER;
