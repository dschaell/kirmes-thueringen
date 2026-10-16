import type { APIContext } from 'astro';
import type { Vorschlag, VorschlagsZeile } from '@kirmes/core';
import { parseDatum } from '@kirmes/core';
import { wochenendVorlage } from './wochenende';
import { adminApi, feld } from './admin';
import { csrfGueltig, FORMULAR_COOKIE, CSRF_FELD } from './csrf';
import { besucherIp } from './meldung';
import { ApiNichtErreichbar, listeOrte } from './api';

export interface AssistentZeile extends VorschlagsZeile {
  gerichte?: number;
  aktiv: boolean;
}
export interface AssistentStand {
  schritt: 1 | 2 | 3;
  ortSlug: string;
  ab: string;
  tage: string;
  zeilen: AssistentZeile[];
  kontaktName: string;
  kontaktEmail: string;
  nachricht: string;
  bestaetigt: boolean;
  geladen: number;
  vorschlag: string;
  fehler: string[];
}
export function vorlage(ab: string, tage: string): AssistentZeile[] {
  if (!parseDatum(ab).ok) return [];
  if (tage === '1') return [{ datum: ab, titel: '', aktiv: true, beginn: '', speisen: [] }];
  return wochenendVorlage(ab)
    .filter((z) => z.datum < addiereTage(ab, Number(tage)))
    .map((z) => ({ ...z, aktiv: true, speisen: [] }));
}
function addiereTage(ab: string, tage: number) {
  const d = new Date(`${ab}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
/** Indizierte Namen verhindern Verschiebungen, wenn Checkboxen abgewählt werden. */
export function leseProgramm(
  f: FormData,
  alt: AssistentZeile[],
  details: boolean,
): AssistentZeile[] {
  return alt.slice(0, 20).map((z, i) =>
    details && !z.aktiv
      ? z
      : {
          ...z,
          ...(details
            ? {
                band: feld(f, `band-${i}`),
                veranstaltungsort: feld(f, `wo-${i}`),
                info: feld(f, `info-${i}`),
                muttizettel: f.has(`mutti-${i}`),
                speisen: Array.from(
                  { length: Math.min(20, Math.max(z.gerichte ?? 3, (z.speisen?.length ?? 0) + 1)) },
                  (_, j) => ({
                    name: feld(f, `gericht-${i}-${j}`),
                    preis: feld(f, `preis-${i}-${j}`),
                  }),
                ).filter((s) => s.name || s.preis),
              }
            : {
                aktiv: f.has(`aktiv-${i}`),
                datum: feld(f, `datum-${i}`),
                beginn: feld(f, `beginn-${i}`),
                titel: feld(f, `titel-${i}`),
              }),
        },
  );
}
function leseStand(s: string): AssistentStand | null {
  if (s.length > 200_000) return null;
  try {
    const v = JSON.parse(s) as AssistentStand;
    if (
      ![1, 2, 3].includes(v.schritt) ||
      typeof v.ortSlug !== 'string' ||
      typeof v.ab !== 'string' ||
      !['1', '2', '3', '4'].includes(v.tage) ||
      !Array.isArray(v.zeilen) ||
      v.zeilen.length > 20 ||
      !v.zeilen.every(
        (z) =>
          z &&
          typeof z.titel === 'string' &&
          typeof z.datum === 'string' &&
          (v.schritt !== 3 || !z.aktiv || parseDatum(z.datum).ok) &&
          (z.gerichte === undefined ||
            (Number.isInteger(z.gerichte) && z.gerichte >= 3 && z.gerichte <= 20)) &&
          (z.speisen === undefined ||
            (Array.isArray(z.speisen) &&
              z.speisen.length <= 20 &&
              z.speisen.every((s) => typeof s.name === 'string' && typeof s.preis === 'string'))),
      ) ||
      typeof v.kontaktName !== 'string' ||
      typeof v.kontaktEmail !== 'string' ||
      typeof v.nachricht !== 'string' ||
      typeof v.vorschlag !== 'string' ||
      typeof v.geladen !== 'number'
    )
      return null;
    return { ...v, fehler: [] };
  } catch {
    return null;
  }
}
type AssistentContext = Pick<
  APIContext,
  'request' | 'url' | 'cookies' | 'redirect' | 'clientAddress'
> & { response: { status?: number; headers: Headers } };
export async function assistent(
  ctx: AssistentContext,
  redaktion: boolean,
  nurStart = false,
): Promise<AssistentStand | Response> {
  let s: AssistentStand = {
    schritt: 1,
    ortSlug: ctx.url.searchParams.get('ort') ?? '',
    ab: '',
    tage: '4',
    zeilen: [],
    kontaktName: '',
    kontaktEmail: '',
    nachricht: '',
    bestaetigt: false,
    geladen: Date.now(),
    vorschlag: '',
    fehler: [],
  };
  ctx.response.headers.set('Cache-Control', 'no-store');
  if (ctx.request.method === 'GET' && redaktion && ctx.url.searchParams.get('vorschlag')) {
    const id = ctx.url.searchParams.get('vorschlag') ?? '';
    const v = await adminApi<Vorschlag>(
      ctx.cookies,
      'GET',
      `termine-vorschlaege/${encodeURIComponent(id)}`,
    );
    if (!v.daten) {
      ctx.response.status = 404;
      s.fehler = v.fehler;
      return s;
    }
    s = {
      ...s,
      schritt: 2,
      ortSlug: v.daten.ortSlug,
      vorschlag: id,
      kontaktName: v.daten.kontaktName ?? '',
      kontaktEmail: v.daten.kontaktEmail ?? '',
      nachricht: v.daten.nachricht ?? '',
      zeilen: v.daten.termine.map((z) => ({
        ...z,
        aktiv: true,
        speisen: z.speisen.map((sp) => ({
          name: sp.name,
          preis: sp.preisCent === null ? '' : (sp.preisCent / 100).toFixed(2).replace('.', ','),
        })),
      })),
    };
    return s;
  }
  if (ctx.request.method !== 'POST' || nurStart) return s;
  const origin = ctx.request.headers.get('origin');
  if (origin) {
    const host = ctx.request.headers.get('x-forwarded-host') ?? ctx.request.headers.get('host');
    try {
      if (new URL(origin).host !== host)
        return new Response('Ungültige Formularherkunft.', { status: 403 });
    } catch {
      return new Response('Ungültige Formularherkunft.', { status: 403 });
    }
  }
  if (Number(ctx.request.headers.get('content-length') ?? 0) > 256_000)
    return new Response('Formular zu groß.', { status: 413 });
  const f = await ctx.request.formData();
  if (f.get('art') === 'link') return s;
  // Die Admin-Middleware schützt sämtliche Admin-POSTs; öffentlich eigener CSRF-Cookie.
  if (!redaktion && !csrfGueltig(ctx.cookies.get(FORMULAR_COOKIE)?.value, f.get(CSRF_FELD))) {
    ctx.response.status = 403;
    s.fehler = ['Bitte die Seite neu laden. Das Formular ist abgelaufen.'];
    return s;
  }
  const stand = leseStand(feld(f, 'stand'));
  if (!stand) {
    ctx.response.status = 400;
    s.fehler = ['Bitte noch einmal bei Schritt 1 beginnen.'];
    return s;
  }
  s = stand;
  if (!redaktion) s.vorschlag = '';
  const aktion = feld(f, 'aktion');
  if (s.schritt === 1) {
    const vorher = `${s.ortSlug}|${s.ab}|${s.tage}`;
    const ortText = feld(f, 'ort');
    const orte = await listeOrte();
    s.ortSlug =
      orte.find((o) => o.slug === ortText || `${o.name} (${o.landkreis}) · ${o.slug}` === ortText)
        ?.slug ?? '';
    s.ab = feld(f, 'ab');
    s.tage = feld(f, 'tage');
    if (!s.ortSlug) s.fehler.push('Bitte einen Ort aus den Vorschlägen wählen.');
    if (!parseDatum(s.ab).ok) s.fehler.push('Bitte ein gültiges Datum wählen.');
    if (!['1', '2', '3', '4'].includes(s.tage)) s.fehler.push('Bitte die Anzahl der Tage wählen.');
    if (!s.fehler.length) {
      if (vorher !== `${s.ortSlug}|${s.ab}|${s.tage}` || !s.zeilen.length)
        s.zeilen = vorlage(s.ab, s.tage);
      s.schritt = 2;
    }
  } else if (s.schritt === 2) {
    s.zeilen = leseProgramm(f, s.zeilen, false);
    if (aktion === 'zurueck') s.schritt = 1;
    else if (aktion === 'eigen') {
      if (s.zeilen.length < 20)
        s.zeilen.push({
          datum: s.ab || s.zeilen[0]?.datum || '',
          titel: '',
          beginn: '',
          aktiv: true,
          speisen: [],
        });
      else s.fehler.push('Höchstens 20 Veranstaltungen je Kirmes.');
    } else {
      if (!s.zeilen.some((z) => z.aktiv))
        s.fehler.push('Bitte mindestens eine Veranstaltung wählen.');
      if (s.zeilen.some((z) => z.aktiv && (!z.titel.trim() || !parseDatum(z.datum).ok)))
        s.fehler.push('Bitte Titel und Datum der gewählten Veranstaltungen ausfüllen.');
      if (!s.fehler.length) s.schritt = 3;
    }
  } else {
    s.zeilen = leseProgramm(f, s.zeilen, true);
    s.kontaktName = feld(f, 'kontaktName');
    s.kontaktEmail = feld(f, 'kontaktEmail');
    s.nachricht = feld(f, 'nachricht');
    s.bestaetigt = f.has('bestaetigt');
    if (aktion.startsWith('gerichte-')) {
      const index = Number(aktion.slice('gerichte-'.length));
      const z = s.zeilen[index];
      if (z) z.gerichte = Math.min(20, Math.max(z.gerichte ?? 3, (z.speisen?.length ?? 0) + 1) + 1);
      return s;
    }
    if (aktion === 'zurueck') {
      s.schritt = 2;
      return s;
    }
    const zeilen = s.zeilen
      .filter((z) => z.aktiv)
      .map((z) => ({
        datum: z.datum,
        beginn: z.beginn || null,
        titel: z.titel,
        band: z.band || null,
        veranstaltungsort: z.veranstaltungsort || null,
        info: z.info || null,
        muttizettel: z.muttizettel ?? false,
        speisen: z.speisen ?? [],
      }));
    if (redaktion) {
      const r = s.vorschlag
        ? await adminApi(
            ctx.cookies,
            'POST',
            `termine-vorschlaege/${encodeURIComponent(s.vorschlag)}/uebernehmen`,
            { ortSlug: s.ortSlug, zeilen, bestaetigt: s.bestaetigt },
          )
        : await adminApi(ctx.cookies, 'POST', 'termine/wochenende', {
            ortSlug: s.ortSlug,
            zeilen: zeilen.map((z) => ({ ...z, bestaetigt: s.bestaetigt })),
          });
      if (r.status < 300)
        return ctx.redirect(
          s.vorschlag ? '/admin/vorschlaege?gespeichert=1' : '/admin?gespeichert=1',
          303,
        );
      s.fehler = r.fehler;
      ctx.response.status = r.status;
    } else {
      let res: Response;
      try {
        res = await fetch(
          new URL('/api/v1/vorschlaege', process.env.API_URL ?? 'http://127.0.0.1:3100'),
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-kirmes-client-ip': besucherIp(ctx.request, ctx.clientAddress),
            },
            body: JSON.stringify({
              ortSlug: s.ortSlug,
              zeilen,
              kontaktName: s.kontaktName,
              kontaktEmail: s.kontaktEmail,
              nachricht: s.nachricht,
              falle: feld(f, 'webseite'),
              dauerMs: Math.max(0, Date.now() - s.geladen),
            }),
            signal: AbortSignal.timeout(25_000),
          },
        );
      } catch (cause) {
        throw new ApiNichtErreichbar({ cause });
      }
      if (res.status === 202) return ctx.redirect('/termin-melden?gesendet=1', 303);
      const json = await res.json().catch(() => ({}));
      s.fehler = json.fehler?.map((f: { meldung: string }) => f.meldung) ?? [
        json.title ?? 'Das Senden klappt gerade nicht. Bitte später versuchen.',
      ];
      ctx.response.status = res.status;
    }
  }
  return s;
}
