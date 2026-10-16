import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kirmeskalender-thueringen.de',
  // Seiten werden pro Anfrage aus der API gerendert → Änderungen in der Datenbank sind sofort sichtbar.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  // Astros eingebaute Origin-Prüfung kennt hinter dem Reverse-Proxy die echte Adresse nicht und lehnt
  // dann alle Formulare ab. Ersetzt durch eine eigene, strengere Prüfung im Redaktionsbereich
  // (Origin passend zu Host/X-Forwarded-Host UND CSRF-Token) – siehe src/middleware.ts.
  security: { checkOrigin: false },
  // Kein Inline-CSS/-JS: erlaubt strenge CSP ohne 'unsafe-inline' (siehe src/middleware.ts)
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
