import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: echte Domain eintragen, sobald registriert
export default defineConfig({
  site: 'https://www.kirmeskalender-thueringen.de',
  integrations: [sitemap()],
  trailingSlash: 'ignore',
  // Kein Inline-CSS/-JS: erlaubt strenge CSP ohne 'unsafe-inline' (siehe apps/web/nginx.conf)
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
