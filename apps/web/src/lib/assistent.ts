import type { APIContext } from 'astro';
import type { Vorschlag, VorschlagsZeile } from '@kirmes/core';
import {
  KATEGORIEN as KATEGORIEN_LISTE,
  koordinateAusText,
  parseDatum,
  type Kategorie,
} from '@kirmes/core';
import { datumKurz } from './anzeige';
import { wochenendVorlage } from './wochenende';
import { findeOrtEindeutig } from './ortssuche';
import { nachAktion } from './terminliste';
import { adminApi, feld } from './admin';
import { csrfGueltig, FORMULAR_COOKIE, CSRF_FELD } from './csrf';
import { besucherIp } from './meldung';
import { ApiNichtErreichbar, listeOrte, sucheTermine } from './api';
import { tageZwischen, verschiebeProgramm } from './vorjahr';

export interface AssistentZeile extends VorschlagsZeile {
  gerichte?: number;
  /** Haken „Essen & Getränke anbieten“ (Issue #155); fehlt er, zählt, ob es Einträge gibt */
  essen?: boolean;
  aktiv: boolean;
}
/** Essen & Getränke nur mit Haken – sonst bleiben eingetippte Einträge unberücksichtigt. */
export const mitEssen = (z: AssistentZeile) => z.essen ?? (z.speisen?.length ?? 0) > 0;
export interface AssistentStand {
  schritt: 1 | 2 | 3;
  zeitraumWechsel?: boolean;
  ortSlug: string;
  /** Getippter Ortstext – bleibt bei „Ort nicht gefunden“ im Feld stehen */
  ortEingabe?: string;
  /** Redaktion: Ort nicht im Verzeichnis – ähnliche Orte bzw. „neu anlegen“ anbieten (#167) */
  ortUnbekannt?: boolean;
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
/** Dauer einer Kirmes: Auswahl 1–4 oder eigene Angabe bis 14 Tage (Issue #150). */
export const TAGE_MAX = 14;
export const gueltigeTage = (t: unknown): t is string =>
  typeof t === 'string' && /^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= TAGE_MAX;
export function vorlage(ab: string, tage: string): AssistentZeile[] {
  if (!parseDatum(ab).ok) return [];
  if (tage === '1') return [{ datum: ab, titel: '', aktiv: true, beginn: '', speisen: [] }];
  return (
    wochenendVorlage(ab)
      .filter((z) => z.datum < addiereTage(ab, Number(tage)))
      // Nur der Kern ist vorab angehakt; der Rest wird angeboten (Issue #87)
      .map(({ kern, ...z }) => ({ ...z, aktiv: kern === true, speisen: [] }))
  );
}
/**
 * Programm der Reihe nach (Issue #149): Tag, dann Uhrzeit; ohne Uhrzeit ans Ende des Tages.
 * Stabil – gleiche Zeitpunkte behalten ihre Reihenfolge.
 */
export const sortiereProgramm = <T extends { datum: string; beginn?: string | null }>(
  zeilen: T[],
): T[] =>
  [...zeilen].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) || (a.beginn || '99:99').localeCompare(b.beginn || '99:99'),
  );

/** Gleicher Titel am gleichen Tag ist nicht erlaubt (ein Termin je Ort, Tag und Titel). */
export function doppelterTitel(zeilen: AssistentZeile[]): string | null {
  const gesehen = new Set<string>();
  for (const z of zeilen.filter((z) => z.aktiv)) {
    const schluessel = `${z.datum}|${z.titel.trim().toLowerCase()}`;
    if (gesehen.has(schluessel))
      return `„${z.titel.trim()}“ steht am ${datumKurz(z.datum)} zweimal im Programm. Bitte einen der beiden anders nennen (z. B. „${z.titel.trim()} am Nachmittag“) oder auf einen anderen Tag legen.`;
    gesehen.add(schluessel);
  }
  return null;
}
const istKategorie = (k: string | null | undefined): k is Kategorie =>
  !!k && (KATEGORIEN_LISTE as readonly string[]).includes(k);
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
                pfarrer: feld(f, `pfarrer-${i}`),
                veranstaltungsort: feld(f, `wo-${i}`),
                info: feld(f, `info-${i}`),
                muttizettel: f.has(`mutti-${i}`),
                essen: f.has(`essen-${i}`),
                // Kartenlink (öffentlich) bzw. Haken „als Platz übernehmen“ (Redaktion) – Issue #169
                karte: feld(f, `karte-${i}`).slice(0, 2000),
                platzUebernehmen: f.has(`platz-${i}`),
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
                // Art wählbar (Issue #93); leer = beim Speichern aus dem Titel erkennen
                kategorie: istKategorie(feld(f, `kat-${i}`)) ? feld(f, `kat-${i}`) : null,
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
      (v.ortEingabe !== undefined && typeof v.ortEingabe !== 'string') ||
      (v.ortUnbekannt !== undefined && typeof v.ortUnbekannt !== 'boolean') ||
      typeof v.ab !== 'string' ||
      !gueltigeTage(v.tage) ||
      !Array.isArray(v.zeilen) ||
      v.zeilen.length > 20 ||
      !v.zeilen.every(
        (z) =>
          z &&
          typeof z.titel === 'string' &&
          typeof z.datum === 'string' &&
          (v.schritt !== 3 || !z.aktiv || parseDatum(z.datum).ok) &&
          (z.essen === undefined || typeof z.essen === 'boolean') &&
          (z.gerichte === undefined ||
            (Number.isInteger(z.gerichte) && z.gerichte >= 3 && z.gerichte <= 20)) &&
          (z.karte === undefined || (typeof z.karte === 'string' && z.karte.length <= 2000)) &&
          (z.platz === undefined ||
            z.platz === null ||
            (typeof z.platz.lat === 'number' && typeof z.platz.lon === 'number')) &&
          (z.platzUebernehmen === undefined || typeof z.platzUebernehmen === 'boolean') &&
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
  // Kirmes vom Vorjahr übernehmen (Issue #106): gleiches Programm, gleiche Wochentage im Folgejahr
  const vorjahr = ctx.url.searchParams.get('vorjahr') ?? '';
  const vonV = ctx.url.searchParams.get('von') ?? '';
  const bisV = ctx.url.searchParams.get('bis') ?? '';
  if (
    ctx.request.method === 'GET' &&
    redaktion &&
    /^[a-z0-9-]{1,120}$/.test(vorjahr) &&
    parseDatum(vonV).ok &&
    parseDatum(bisV).ok &&
    tageZwischen(vonV, bisV) >= 0 &&
    tageZwischen(vonV, bisV) <= 13
  ) {
    const alt = (await sucheTermine({ ort: vorjahr, von: vonV, bis: bisV, limit: 20 })).termine;
    const neu = sortiereProgramm(verschiebeProgramm(alt));
    if (neu.length) {
      const ab = neu[0]?.datum ?? '';
      s = {
        ...s,
        schritt: 2,
        ortSlug: vorjahr,
        ab,
        tage: String(
          Math.min(TAGE_MAX, Math.max(1, tageZwischen(ab, neu.at(-1)?.datum ?? ab) + 1)),
        ),
        zeilen: neu.map((t) => ({
          datum: t.datum,
          beginn: t.beginn ?? '',
          titel: t.titel,
          kategorie: t.kategorie,
          band: t.band ?? '',
          veranstaltungsort: t.veranstaltungsort ?? '',
          info: t.info ?? '',
          muttizettel: t.muttizettel,
          aktiv: true,
          speisen: [],
        })),
      };
      return s;
    }
  }
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
      zeilen: sortiereProgramm(v.daten.termine).map((z) => ({
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
    // „Meintest du …?“ – Klick auf einen ähnlichen Ort ersetzt die Eingabe (Issue #167)
    const ortText = feld(f, 'ortWahl') || feld(f, 'ort');
    // Eindeutig und tolerant (Groß-/Kleinschreibung, Umlaute) – Issue #89
    s.ortSlug = findeOrtEindeutig(await listeOrte(), ortText)?.slug ?? '';
    s.ortEingabe = ortText.slice(0, 200);
    s.ortUnbekannt = undefined;
    // Redaktion: fehlenden Ort gleich mit anlegen (Issue #167) – öffentlich nie
    const neuerName = ortText.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!s.ortSlug && redaktion && neuerName) {
      s.ortUnbekannt = true;
      if (f.has('ortAnlegen')) {
        const lage = feld(f, 'ortLage');
        const k = lage ? koordinateAusText(lage) : null;
        if (lage && !k)
          s.fehler.push(
            'Lage nicht erkannt – bitte einen Google-Maps-Link mit Pin oder Koordinaten wie „50.87, 10.82“ einfügen (oder leer lassen).',
          );
        else {
          const neu = await adminApi<{ slug: string; name: string }>(ctx.cookies, 'POST', 'orte', {
            name: neuerName,
            landkreis: feld(f, 'ortKreis'),
            lat: k?.lat ?? null,
            lon: k?.lon ?? null,
          });
          if (neu.daten) {
            s.ortSlug = neu.daten.slug;
            s.ortEingabe = neu.daten.name;
            s.ortUnbekannt = undefined;
          } else s.fehler.push(...neu.fehler);
        }
      }
    }
    s.ab = feld(f, 'ab');
    const auswahl = feld(f, 'tage');
    // „Andere Dauer …“ (Issue #150): Zahl aus dem Zusatzfeld, führende Nullen weg
    s.tage = auswahl === 'eigen' ? String(Number(feld(f, 'tageEigen')) || '') : auswahl;
    if (!s.ortSlug && !s.fehler.length)
      s.fehler.push(
        s.ortUnbekannt
          ? `„${neuerName}“ ist nicht im Ortsverzeichnis – unten einen ähnlichen Ort wählen oder neu anlegen.`
          : 'Bitte einen Ort aus den Vorschlägen wählen.',
      );
    if (!parseDatum(s.ab).ok) s.fehler.push('Bitte ein gültiges Datum wählen.');
    if (!gueltigeTage(s.tage))
      s.fehler.push(`Bitte die Anzahl der Tage wählen (1 bis ${TAGE_MAX}).`);
    if (!s.fehler.length) {
      const wechsel = vorher !== `${s.ortSlug}|${s.ab}|${s.tage}` || s.zeitraumWechsel;
      if (wechsel && s.zeilen.length && !f.has('programmErsetzen')) {
        s.zeitraumWechsel = true;
        s.fehler.push(
          'Der neue Ort oder Zeitraum ersetzt dein bisher bearbeitetes Programm. Bitte unten ausdrücklich bestätigen.',
        );
        return s;
      }
      if (wechsel || !s.zeilen.length) s.zeilen = vorlage(s.ab, s.tage);
      s.zeitraumWechsel = false;
      s.schritt = 2;
    }
  } else if (s.schritt === 2) {
    s.zeilen = sortiereProgramm(leseProgramm(f, s.zeilen, false));
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
      const doppelt = doppelterTitel(s.zeilen);
      if (doppelt) s.fehler.push(doppelt);
      if (!s.fehler.length) s.schritt = 3;
    }
  } else {
    s.zeilen = leseProgramm(f, s.zeilen, true);
    // In der Redaktion gibt es diese Felder nicht – Angaben des Einsenders bleiben erhalten
    if (!redaktion) {
      s.kontaktName = feld(f, 'kontaktName');
      s.kontaktEmail = feld(f, 'kontaktEmail');
      s.nachricht = feld(f, 'nachricht');
    }
    s.bestaetigt = f.has('bestaetigt');
    if (aktion.startsWith('gerichte-')) {
      const index = Number(aktion.slice('gerichte-'.length));
      const z = s.zeilen[index];
      if (z) {
        z.gerichte = Math.min(20, Math.max(z.gerichte ?? 3, (z.speisen?.length ?? 0) + 1) + 1);
        z.essen = true;
      }
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
        kategorie: z.kategorie && istKategorie(z.kategorie) ? z.kategorie : null,
        band: z.band || null,
        pfarrer: z.pfarrer,
        veranstaltungsort: z.veranstaltungsort || null,
        info: z.info || null,
        muttizettel: z.muttizettel ?? false,
        speisen: mitEssen(z) ? (z.speisen ?? []) : [],
        // Öffentlich nur der Link (Server prüft, speichert nur Koordinaten); Redaktion den Punkt
        ...(redaktion
          ? s.vorschlag
            ? { platz: z.platz ?? null, platzUebernehmen: z.platzUebernehmen === true }
            : {}
          : z.karte
            ? { karte: z.karte }
            : {}),
      }));
    if (redaktion) {
      const r = s.vorschlag
        ? await adminApi(
            ctx.cookies,
            'POST',
            `termine-vorschlaege/${encodeURIComponent(s.vorschlag)}/uebernehmen`,
            { ortSlug: s.ortSlug, zeilen, bestaetigt: s.bestaetigt },
          )
        : await adminApi<{ termine?: { id: string }[] }>(
            ctx.cookies,
            'POST',
            'termine/wochenende',
            {
              ortSlug: s.ortSlug,
              zeilen: zeilen.map((z) => ({ ...z, bestaetigt: s.bestaetigt })),
            },
          );
      if (r.status < 300) {
        if (s.vorschlag) return ctx.redirect('/admin/vorschlaege?gespeichert=1', 303);
        // Liste genau auf diese Kirmes filtern – auch wenn sie schon vorbei ist (Issue #90)
        const ids = (r.daten as { termine?: { id: string }[] } | null)?.termine?.map((t) => t.id);
        const erster = zeilen.map((z) => z.datum).sort()[0] ?? '';
        return ctx.redirect(
          nachAktion(null, 'gespeichert', ids ?? [], {
            ort: s.ortSlug,
            von: erster,
            zeitraum: 'alle',
          }),
          303,
        );
      }
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
