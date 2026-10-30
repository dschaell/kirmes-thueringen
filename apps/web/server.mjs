/**
 * Produktions-Startpunkt der Website. Umhüllt den Astro-Node-Handler, damit ALLE Antworten –
 * auch statische Dateien und vorgerenderte Seiten – die Sicherheits-Header tragen.
 */
import http from 'node:http';
import { headerFuer } from './sicherheits-header.mjs';
import { erstelleRateLimit, ladeGrenzen } from './rate-limit.mjs';
import { erstelleZaehler, meldeAnApi } from './zaehler.mjs';

process.env.ASTRO_NODE_AUTOSTART = 'disabled'; // eigener Server statt Astro-Standalone-Start
const { handler } = await import('./dist/server/entry.mjs');

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? '0.0.0.0';

const begrenze = erstelleRateLimit(ladeGrenzen());
// Zugriffszahlen ohne Tracking (Issue #311)
const zaehler = erstelleZaehler({
  melde: meldeAnApi(process.env.API_URL ?? 'http://127.0.0.1:3100'),
});

const server = http.createServer((req, res) => {
  for (const [name, wert] of Object.entries(headerFuer(req.url ?? '/'))) res.setHeader(name, wert);
  if (!begrenze(req, res)) return;
  zaehler.zaehle(req, res);
  handler(req, res);
});
server.listen(port, host, () => console.log(`Website läuft auf http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void zaehler.leere();
    server.close(() => process.exit(0));
  });
}
