import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: echte Domain eintragen, sobald registriert
export default defineConfig({
  site: 'https://www.kirmeskalender-thueringen.de',
  integrations: [sitemap()],
  trailingSlash: 'ignore',
});
