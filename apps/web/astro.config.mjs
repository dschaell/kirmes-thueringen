import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

// TODO: echte Domain eintragen, sobald registriert
export default defineConfig({
  site: 'https://www.kirmeskalender-thueringen.de',
  // Seiten werden pro Anfrage aus der API gerendert → Änderungen in der Datenbank sind sofort sichtbar.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  // Kein Inline-CSS/-JS: erlaubt strenge CSP ohne 'unsafe-inline' (siehe src/middleware.ts)
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
