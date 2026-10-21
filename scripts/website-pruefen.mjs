#!/usr/bin/env node
/**
 * Tägliche Prüfung der Live-Website: Funktionstests + Lighthouse-Grenzwerte.
 * Ergebnis als Markdown nach stdout (für das Monitoring-Issue), Exit-Code 1 bei Befunden.
 *
 *   node scripts/website-pruefen.mjs [https://kirmeskalender-thueringen.de] [--lighthouse <ordner>]
 *
 * Mit --lighthouse liest das Skript die JSON-Berichte aus dem Ordner (erzeugt vom Workflow) und
 * vergleicht sie mit den Grenzwerten unten. Legt nichts an und schickt keine Formulare ab.
 */
import { readdir, readFile } from 'node:fs/promises';
import { TextEncoder } from 'node:util';

const args = process.argv.slice(2);
const BASIS = (
  args.find((a) => a.startsWith('http')) ?? 'https://kirmeskalender-thueringen.de'
).replace(/\/$/, '');
const lhOrdner = args.includes('--lighthouse') ? args[args.indexOf('--lighthouse') + 1] : null;

const befunde = [];
const ok = [];
const pruefe = (bedingung, text) => (bedingung ? ok : befunde).push(text);

/**
 * Höflich abrufen (Issue #220): Die Website begrenzt auf 120 Seiten pro Minute und IP. Bei 429
 * wartet die Prüfung die Zeit aus „Retry-After“ (höchstens 65 s) und fragt einmal neu – sonst
 * meldet sie Fehlalarme, die die eigene Sperre ausgelöst hat.
 */
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function hole(pfad, init = {}, nochmal = true) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASIS + pfad, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Kirmeskalender-Pruefung/1.0 (+GitHub Actions)' },
      ...init,
    });
    if (r.status === 429 && nochmal) {
      const sekunden = Math.min(65, Number(r.headers.get('retry-after')) || 30);
      await r.body?.cancel();
      await warte(sekunden * 1000);
      return hole(pfad, init, false);
    }
    const text = (r.headers.get('content-type') ?? '').startsWith('image/') ? '' : await r.text();
    return { r, text, ms: Date.now() - t0 };
  } catch (e) {
    return { r: null, text: '', ms: Date.now() - t0, fehler: String(e) };
  }
}

// ── Seiten, die immer funktionieren müssen ─────────────────────────────────────────────
const SEITEN = [
  ['/', 200, 'Kirmes in Thüringen'],
  ['/termine', 200, 'Kirmes-Termine'],
  ['/termine?zeit=alle', 200, 'Kirmes-Termine'],
  ['/orte', 200, 'Orte von A bis Z'],
  ['/orte/alkersleben', 200, 'Kirmes in Alkersleben'],
  ['/karte', 200, 'Kirmes in deiner Nähe'],
  ['/kreise', 200, 'Kirmes nach Landkreis'],
  ['/kreise/ik', 200, 'Ilm-Kreis'],
  ['/termin-melden', 200, 'Termin melden'],
  ['/kalender-abonnieren', 200, 'Kirmes im eigenen Kalender'],
  ['/redaktion-mitmachen', 200, 'mitmachen'],
  ['/ueber-die-kirmes', 200, 'Über die Kirmes'],
  ['/muttizettel', 200, 'Erziehungs'],
  ['/impressum', 200, 'Impressum'],
  ['/datenschutz', 200, 'Datenschutz'],
  ['/gibtsnicht-pruefung', 404, 'Seite nicht gefunden'],
];
for (const [pfad, status, inhalt] of SEITEN) {
  const { r, text, ms, fehler } = await hole(pfad);
  pruefe(
    r?.status === status && text.includes(inhalt),
    `${pfad} → ${r?.status ?? fehler} (${ms} ms)${r?.status === status && !text.includes(inhalt) ? `, „${inhalt}“ fehlt` : ''}`,
  );
  pruefe(ms < 3000, `${pfad} antwortet in ${ms} ms (Grenze 3.000 ms)`);
  if (r?.status === 200) {
    const csp = r.headers.get('content-security-policy') ?? '';
    pruefe(
      csp.includes("default-src 'self'") && !csp.includes('unsafe-inline'),
      `${pfad}: CSP streng`,
    );
  }
}

// ── Zusammengeklebte Wörter (Astro entfernt Zeilenumbrüche vor Tags, Issue #142) ─────────
for (const [pfad] of SEITEN.filter(([, status]) => status === 200)) {
  const { text } = await hole(pfad);
  const html = text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const kleber = [
    ...html.matchAll(/[A-Za-zäöüßÄÖÜ0-9,;:]{2}<(?:em|strong|a|b|i|abbr)\b[^>]*>[A-Za-zäöüßÄÖÜ]/g),
    ...html.matchAll(/<\/(?:em|strong|a|b|i|abbr)>[A-Za-zäöüß]{2}/g),
  ].map((m) => m[0].replace(/<[^>]+>/g, '|'));
  pruefe(
    kleber.length === 0,
    `${pfad}: keine zusammengeklebten Wörter${kleber.length ? ` (${kleber.slice(0, 3).join(', ')})` : ''}`,
  );
}

// ── Sonderfälle ───────────────────────────────────────────────────────────────────────
const ics = await hole('/kalender.ics');
pruefe(
  ics.r?.status === 200 &&
    ics.text.startsWith('BEGIN:VCALENDAR') &&
    ics.text.includes('BEGIN:VTIMEZONE'),
  '/kalender.ics gültig (VCALENDAR + VTIMEZONE)',
);
pruefe(
  ics.text.split('\r\n').every((z) => new TextEncoder().encode(z).length <= 75),
  '/kalender.ics: alle Zeilen ≤ 75 Oktette',
);
pruefe((await hole('/kalender.ics?kreis=XX')).r?.status === 404, '/kalender.ics?kreis=XX → 404');

const sitemap = await hole('/sitemap.xml');
const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
pruefe(urls.length >= 30, `Sitemap mit ${urls.length} URLs`);
pruefe(
  /<loc>[^<]*\/termin\/[^<]*<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap.text),
  'Sitemap: Termine mit lastmod',
);
const robots = await hole('/robots.txt');
pruefe(/Disallow: \/admin/.test(robots.text), 'robots.txt sperrt /admin');
// Jede Terminseite aus der Sitemap muss erreichbar sein und ein eigenes Vorschaubild haben
const terminSeiten = urls.filter((u) => u.includes('/termin/')).slice(0, 25);
for (const u of terminSeiten) {
  const pfad = new URL(u).pathname;
  const { r, text } = await hole(pfad);
  const bild = /property="og:image" content="([^"]+)"/.exec(text)?.[1] ?? '';
  pruefe(r?.status === 200 && bild.endsWith('/bild.png'), `${pfad} erreichbar mit Vorschaubild`);
  if (bild) {
    const b = await hole(new URL(bild).pathname);
    pruefe(b.r?.headers.get('content-type') === 'image/png', `${pfad}/bild.png ist ein PNG`);
  }
  // SEO (Issue #182): Event mit Zeitzone, Ende, Beschreibung, Bild + Brotkrumen
  const ld = [...text.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(
    (m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return {};
      }
    },
  );
  const ev = ld.find((x) => x['@type'] === 'Event');
  pruefe(
    !!ev?.endDate &&
      !!ev?.description &&
      !!ev?.image &&
      /^\d{4}-\d{2}-\d{2}(T.*[+-]\d{2}:\d{2})?$/.test(ev?.startDate ?? ''),
    `${pfad}: Event-Daten vollständig (Start mit Zeitzone, Ende, Beschreibung, Bild)`,
  );
  pruefe(
    ld.some((x) => x['@type'] === 'BreadcrumbList'),
    `${pfad}: Brotkrumen-Daten`,
  );
  const k = await hole(`${pfad}/korrektur`);
  pruefe(k.r?.status === 200, `${pfad}/korrektur erreichbar`);
}
for (const u of urls.filter((u) => !u.includes('/termin/')).slice(0, 60)) {
  const { r } = await hole(new URL(u).pathname);
  pruefe(r?.status === 200, `Sitemap: ${new URL(u).pathname} → ${r?.status}`);
}

const kachel = await hole('/kacheln/8/135/85.png');
pruefe(kachel.r?.headers.get('content-type') === 'image/png', 'Kartenkacheln über eigenen Server');
pruefe((await hole('/kacheln/12/2048/1362.png')).r?.status === 404, 'Kachel-Proxy nicht für Paris');
// Breite Bildschirme (Issue #129): Zoom 8 braucht ganz Deutschland, Zoom 6 den Rand
for (const k of [
  '/kacheln/8/131/85.png',
  '/kacheln/8/139/85.png',
  '/kacheln/6/32/20.png',
  '/kacheln/6/34/21.png',
])
  pruefe((await hole(k)).r?.status === 200, `Randkachel ${k} für breite Bildschirme`);
const karte = await hole('/karte');
pruefe(
  !(karte.r?.headers.get('content-security-policy') ?? '').includes('openstreetmap'),
  'Karte lädt nichts von Drittanbietern',
);
const admin = await hole('/admin');
pruefe(
  admin.r?.status === 303 && (admin.r?.headers.get('location') ?? '').startsWith('/admin/anmelden'),
  '/admin ohne Sitzung → Anmeldung',
);
pruefe((await hole('/favicon.ico')).r?.status === 200, '/favicon.ico vorhanden');

// ── Lighthouse ────────────────────────────────────────────────────────────────────────
/** Grenzwerte je Seite: Leistung, Barrierefreiheit, Best Practices, SEO, CLS */
const GRENZEN = {
  standard: { performance: 0.9, accessibility: 0.95, 'best-practices': 0.95, seo: 0.95, cls: 0.1 },
  karte: { performance: 0.7, accessibility: 0.95, 'best-practices': 0.9, seo: 0.95, cls: 0.1 },
};
const lighthouse = [];
const hinweise = [];
if (lhOrdner) {
  // Je Seite mehrere Läufe (name-1.json, name-2.json …): für die Punkte zählt der beste – Lighthouse
  // schwankt auf geteilten CI-Rechnern –, für das Springen (CLS) der schlechteste.
  // Abgebrochene Läufe (z. B. NO_NAVSTART) zählen nicht als 0.
  const laeufe = new Map();
  for (const datei of (await readdir(lhOrdner)).filter((d) => d.endsWith('.json'))) {
    const name = datei.replace(/(-\d+)?\.json$/, '');
    const d = JSON.parse(await readFile(`${lhOrdner}/${datei}`, 'utf8'));
    if (d.runtimeError) {
      hinweise.push(`Lighthouse ${name}: Messung abgebrochen (${d.runtimeError.code})`);
      continue;
    }
    laeufe.set(name, [...(laeufe.get(name) ?? []), d]);
  }
  const erwartet = new Set(
    (await readdir(lhOrdner))
      .filter((d) => d.endsWith('.json'))
      .map((d) => d.replace(/(-\d+)?\.json$/, '')),
  );
  for (const name of erwartet)
    pruefe(laeufe.has(name), `Lighthouse ${name}: mindestens eine gültige Messung`);
  for (const [name, berichte] of laeufe) {
    const g = GRENZEN[name] ?? GRENZEN.standard;
    const werte = {};
    for (const d of berichte)
      for (const [k, v] of Object.entries(d.categories))
        werte[k] = Math.max(werte[k] ?? 0, v.score ?? 0);
    // Springen zählt im schlechteren Lauf: trifft es jeden zweiten Besuch, ist es ein echter Fehler
    const cls = Math.max(
      ...berichte.map((d) => d.audits['cumulative-layout-shift']?.numericValue ?? 0),
    );
    const spalte = (k) => (k in werte ? String(Math.round(werte[k] * 100)) : '–');
    lighthouse.push(
      `| ${name} | ${['performance', 'accessibility', 'best-practices', 'seo'].map(spalte).join(' | ')} | ${cls.toFixed(3)} | ${berichte.length} |`,
    );
    for (const [k, min] of Object.entries(g)) {
      if (k === 'cls') {
        // Bei zu viel Springen gleich sagen, was springt und warum (aus dem schlechtesten Lauf)
        const bester = berichte.reduce((a, b) =>
          (a.audits['cumulative-layout-shift']?.numericValue ?? 0) >=
          (b.audits['cumulative-layout-shift']?.numericValue ?? 0)
            ? a
            : b,
        );
        const ursachen = (bester.audits['layout-shifts']?.details?.items ?? [])
          .slice(0, 3)
          .map((it) => {
            const was = (it.node?.snippet ?? '?').slice(0, 80);
            const warum = (it.subItems?.items ?? [])
              .map((u) => u.extra?.value ?? u.cause ?? '')
              .filter(Boolean)
              .join(', ')
              .slice(0, 120);
            return `\`${was}\`${warum ? ` ← ${warum}` : ''} (${(it.score ?? 0).toFixed(3)})`;
          });
        pruefe(
          cls <= min,
          `Lighthouse ${name}: CLS ${cls.toFixed(3)} (Grenze ${min})${cls > min && ursachen.length ? `: ${ursachen.join('; ')}` : ''}`,
        );
      } else if (k in werte)
        pruefe(
          werte[k] >= min,
          `Lighthouse ${name}: ${k} ${Math.round(werte[k] * 100)} (Grenze ${min * 100})`,
        );
    }
  }
}

// ── Bericht ───────────────────────────────────────────────────────────────────────────
const zeilen = [
  `**Prüfung von ${BASIS}** – ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  '',
  befunde.length
    ? `### ✖ ${befunde.length} Befund${befunde.length === 1 ? '' : 'e'}\n\n${befunde.map((b) => `- ${b}`).join('\n')}`
    : '### ✔ Keine Befunde',
  ...(hinweise.length ? ['', `**Hinweise:** ${hinweise.join(' · ')}`] : []),
  '',
  `<details><summary>${ok.length} Prüfungen bestanden</summary>\n\n${ok.map((b) => `- ${b}`).join('\n')}\n</details>`,
];
if (lighthouse.length)
  zeilen.push(
    '',
    '| Seite | Leistung | Barrierefreiheit | Best Practices | SEO | CLS | Läufe |',
    '|---|---|---|---|---|---|---|',
    ...lighthouse,
  );
console.log(zeilen.join('\n'));
process.exitCode = befunde.length ? 1 : 0;
