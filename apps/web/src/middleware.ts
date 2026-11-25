import { darf, nurEigenerOrt } from '@kirmes/core';
import { defineMiddleware, sequence } from 'astro:middleware';
import { adminApi } from './lib/admin';
import { CSRF_COOKIE, CSRF_FELD, CSRF_HEADER, csrfGueltig, csrfToken } from './lib/csrf';
import { ApiNichtErreichbar } from './lib/api';

// Sicherheits-Header setzt server.mjs für jede Antwort (auch statische Dateien).

type Aktion = { href: string; text: string; primaer?: boolean };

/**
 * Fehlerseiten dieser Middleware: ohne Layout, weil die API gerade fehlen kann. Stil kommt aus
 * /fehlerseite.css (die CSP erlaubt kein Inline-Style). Farben und Schrift wie auf der Website.
 */
const fehlerSeite = (
  status: number,
  o: { titel: string; meldung: string; aktionen: Aktion[] },
  extra: Record<string, string> = {},
) => {
  const esc = (t: string) =>
    t.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
    );
  const knoepfe = o.aktionen
    .map(
      (a) =>
        `<a class="knopf${a.primaer ? '' : ' zweit'}" href="${esc(a.href)}">${esc(a.text)}</a>`,
    )
    .join('');
  const html =
    `<!doctype html><html lang="de"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${esc(o.titel)} – Kirmeskalender Thüringen</title>` +
    `<link rel="stylesheet" href="/fehlerseite.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
    `</head><body><div class="wimpel" aria-hidden="true"></div>` +
    `<header><a class="marke" href="/"><img src="/favicon.svg" alt="" width="36" height="36">` +
    `<span>Kirmeskalender<small>Thüringen</small></span></a></header>` +
    `<main><section class="karte"><p class="code">Fehler ${status}</p>` +
    `<h1>${esc(o.titel)}</h1><p class="text">${esc(o.meldung)}</p>` +
    `<div class="aktionen">${knoepfe}</div></section></main>` +
    `<footer>© ${new Date().getFullYear()} Kirmeskalender Thüringen</footer></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
};

/** Fällt die API (oder dahinter die Datenbank) aus, zeigt die Website eine freundliche 503-Seite. */
const ausfall = defineMiddleware(async (ctx, next) => {
  try {
    return await next();
  } catch (e) {
    if (!(e instanceof ApiNichtErreichbar)) throw e;
    console.error('API nicht erreichbar:', e.cause);
    return fehlerSeite(
      503,
      {
        titel: 'Die Termine sind gerade nicht erreichbar',
        meldung: 'Bitte versuche es in ein paar Minuten noch einmal.',
        aktionen: [
          { href: ctx.url.pathname + ctx.url.search, text: 'Seite neu laden', primaer: true },
          { href: '/', text: 'Zur Startseite' },
        ],
      },
      { 'Retry-After': '30' },
    );
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
      return fehlerSeite(403, {
        titel: 'Sitzung abgelaufen',
        meldung:
          'Das Formular passt nicht mehr zur Sitzung. Bitte lade die Seite neu und versuche es noch einmal.',
        aktionen: [
          { href: ctx.url.pathname, text: 'Seite neu laden', primaer: true },
          { href: '/', text: 'Zur Startseite' },
        ],
      });
    }
  }
  ctx.locals.csrf = csrfToken(ctx.cookies);

  // Ohne Sitzung erreichbar: Anmeldung, Ersteinrichtung, Einladung und deren Passkey-Endpunkte
  const ohneSitzung =
    pfad === '/admin/anmelden' ||
    pfad.startsWith('/admin/anmelden/') ||
    pfad === '/admin/einrichten' ||
    pfad === '/admin/einladung' ||
    pfad.startsWith('/admin/zugang/');
  if (!ohneSitzung) {
    const ich = await adminApi<{
      adminId: string;
      name: string;
      rolle: 'admin' | 'redaktion' | 'kirmesgesellschaft';
      ortSlug: string | null;
      ortName: string | null;
      kgName?: string | null;
    }>(ctx.cookies, 'GET', 'ich');
    if (ich.status !== 200 || !ich.daten)
      return ctx.redirect(
        `/admin/anmelden?weiter=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
        303,
      );
    ctx.locals.adminId = ich.daten.adminId;
    ctx.locals.name = ich.daten.name;
    ctx.locals.rolle = ich.daten.rolle;
    ctx.locals.ortSlug = ich.daten.ortSlug;
    ctx.locals.ortName = ich.daten.ortName;
    ctx.locals.kgName = ich.daten.kgName ?? null;
    // Mitglieder verwalten nur Admins (die API prüft das zusätzlich)
    if (
      ((pfad.startsWith('/admin/mitglieder') || pfad.startsWith('/admin/anfragen')) &&
        !darf(ich.daten, 'mitglieder')) ||
      (pfad.startsWith('/admin/zugriffe') && !darf(ich.daten, 'statistik'))
    ) {
      return ctx.redirect('/admin', 303);
    }
    // „Eure Leute“ ist die Seite der Kirmesgesellschaften – alle anderen verwalten unter Mitglieder
    if (pfad === '/admin/unsere-leute' && !nurEigenerOrt(ich.daten)) {
      return ctx.redirect('/admin/mitglieder', 303);
    }
    // Kirmesgesellschaft (Issue #180): nur ihre Seiten, nur ihr Ort – die API prüft zusätzlich
    if (nurEigenerOrt(ich.daten)) {
      const eigen = ich.daten.ortSlug ?? '';
      const erlaubt =
        pfad === '/admin' ||
        pfad === '/admin/vorschlaege' ||
        pfad === '/admin/kirmes-eintragen' ||
        pfad === '/admin/termine' ||
        pfad.startsWith('/admin/termine/') ||
        pfad === `/admin/orte/${eigen}` ||
        pfad === '/admin/unsere-leute' ||
        pfad === '/admin/beitraege' ||
        pfad === '/admin/mehr' ||
        pfad === '/admin/bestaetigen' ||
        pfad.startsWith('/admin/passkeys') ||
        pfad === '/admin/abmelden';
      if (!erlaubt) return ctx.redirect('/admin', 303);
      const ort = ctx.url.searchParams.get('ort');
      if (pfad === '/admin/termine' && ort !== eigen) {
        const ziel = new URL(ctx.url);
        ziel.searchParams.set('ort', eigen);
        return ctx.redirect(`${ziel.pathname}${ziel.search}`, 303);
      }
    }
  }
  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});

export const onRequest = sequence(ausfall, redaktion);
