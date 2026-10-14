import { defineMiddleware } from 'astro:middleware';
import { ApiNichtErreichbar } from './lib/api';

// Sicherheits-Header setzt server.mjs für jede Antwort (auch statische Dateien).

const fehlerSeite = () =>
  new Response(
    '<!doctype html><html lang="de"><meta charset="utf-8"><title>Kurz nicht erreichbar – Kirmeskalender Thüringen</title>' +
      '<h1>Die Termine sind gerade nicht erreichbar</h1><p>Bitte versuche es in ein paar Minuten noch einmal.</p></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' } },
  );

/** Fällt die API (oder dahinter die Datenbank) aus, zeigt die Website eine freundliche 503-Seite. */
export const onRequest = defineMiddleware(async (_ctx, next) => {
  try {
    return await next();
  } catch (e) {
    if (!(e instanceof ApiNichtErreichbar)) throw e;
    console.error('API nicht erreichbar:', e.cause);
    return fehlerSeite();
  }
});
