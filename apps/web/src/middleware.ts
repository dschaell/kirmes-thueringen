import { defineMiddleware, sequence } from 'astro:middleware';
import { adminApi } from './lib/admin';
import { CSRF_COOKIE, CSRF_FELD, CSRF_HEADER, csrfGueltig, csrfToken } from './lib/csrf';
import { ApiNichtErreichbar } from './lib/api';

// Sicherheits-Header setzt server.mjs für jede Antwort (auch statische Dateien).

const fehlerSeite = () =>
  new Response(
    '<!doctype html><html lang="de"><meta charset="utf-8"><title>Kurz nicht erreichbar – Kirmeskalender Thüringen</title>' +
      '<h1>Die Termine sind gerade nicht erreichbar</h1><p>Bitte versuche es in ein paar Minuten noch einmal.</p></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' } },
  );

/** Fällt die API (oder dahinter die Datenbank) aus, zeigt die Website eine freundliche 503-Seite. */
const ausfall = defineMiddleware(async (_ctx, next) => {
  try {
    return await next();
  } catch (e) {
    if (!(e instanceof ApiNichtErreichbar)) throw e;
    console.error('API nicht erreichbar:', e.cause);
    return fehlerSeite();
  }
});

/**
 * Formulare dürfen nur von der eigenen Seite kommen: Der Origin-Header (falls vorhanden) muss zur
 * aufgerufenen Adresse passen. Hinter Caddy ist das X-Forwarded-Host (setzt Caddy selbst, Werte von
 * außen werden überschrieben), lokal der Host-Header.
 */
function gleicheHerkunft(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // ältere Browser senden keinen Origin – dann schützt das CSRF-Token
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Redaktionsbereich: Jede Seite unter /admin außer der Anmeldung verlangt eine gültige Sitzung.
 * Admin-Seiten werden nie gecacht und nie von Suchmaschinen erfasst.
 */
const redaktion = defineMiddleware(async (ctx, next) => {
  const pfad = ctx.url.pathname;
  if (!pfad.startsWith('/admin')) return next();

  // CSRF: jedes POST im Redaktionsbereich braucht das Token aus dem eigenen Cookie –
  // Formulare im Feld „csrf_token“, JSON-Aufrufe (Passkeys) im Header „X-CSRF-Token“
  if (ctx.request.method === 'POST') {
    const istJson = (ctx.request.headers.get('content-type') ?? '').startsWith('application/json');
    const gesendet = istJson
      ? ctx.request.headers.get(CSRF_HEADER)
      : (
          await ctx.request
            .clone()
            .formData()
            .catch(() => null)
        )?.get(CSRF_FELD);
    if (
      !gleicheHerkunft(ctx.request) ||
      !csrfGueltig(ctx.cookies.get(CSRF_COOKIE)?.value, gesendet)
    ) {
      return new Response(
        'Sitzung abgelaufen oder ungültiges Formular. Bitte die Seite neu laden.',
        {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        },
      );
    }
  }
  ctx.locals.csrf = csrfToken(ctx.cookies);

  // Anmeldeseite und ihre Passkey-Endpunkte sind ohne Sitzung erreichbar
  if (pfad !== '/admin/anmelden' && !pfad.startsWith('/admin/anmelden/')) {
    const ich = await adminApi<{ adminId: string }>(ctx.cookies, 'GET', 'ich');
    if (ich.status !== 200) return ctx.redirect('/admin/anmelden', 303);
    ctx.locals.adminId = ich.daten?.adminId;
  }
  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});

export const onRequest = sequence(ausfall, redaktion);
