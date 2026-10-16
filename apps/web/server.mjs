/**
 * Produktions-Startpunkt der Website. Umhüllt den Astro-Node-Handler, damit ALLE Antworten –
 * auch statische Dateien und vorgerenderte Seiten – die Sicherheits-Header tragen.
 */
import http from 'node:http';
import { headerFuer } from './sicherheits-header.mjs';
import { erstelleRateLimit, ladeGrenzen } from './rate-limit.mjs';

process.env.ASTRO_NODE_AUTOSTART = 'disabled'; // eigener Server statt Astro-Standalone-Start
const { handler } = await import('./dist/server/entry.mjs');

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? '0.0.0.0';

const begrenze = erstelleRateLimit(ladeGrenzen());

const server = http.createServer((req, res) => {
  for (const [name, wert] of Object.entries(headerFuer(req.url ?? '/'))) res.setHeader(name, wert);
  if (!begrenze(req, res)) return;
  handler(req, res);
});
server.listen(port, host, () => console.log(`Website läuft auf http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
