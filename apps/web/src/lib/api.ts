/**
 * Datenzugriff des Client-Tiers: ausschließlich über die HTTP-API des Server-Tiers.
 * Läuft nur serverseitig (SSR) – der Browser spricht nie direkt mit der API.
 */
import type { Beitrag, Kategorie, LandkreisKuerzel } from '@kirmes/core';

/** Interne Adresse der API: lokal http://127.0.0.1:3100, im Container-Netz http://api:3100 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';
const TIMEOUT_MS = 5_000;

export interface OrtDto {
  slug: string;
  name: string;
  landkreis: LandkreisKuerzel;
  koordinate: { lat: number; lon: number } | null;
  /** Selbst eingetragener Name der Kirmesgesellschaft */
  kgName?: string | null;
  /** Vereinsprofil (Issue #310), nur in der Einzelansicht des Ortes */
  profil?: {
    text: string | null;
    website: string | null;
    instagram: string | null;
    facebook: string | null;
    kontakt: string | null;
  } | null;
}

export interface OrtUebersichtDto extends OrtDto {
  anzahlKommend: number;
}

export interface TerminDto {
  /** Ausschließlich in geschützten Bearbeitungsantworten. */
  version?: string;
  /** Letzte Änderung (UTC, ISO) – für Kalender-Abos */
  geaendertAm?: string;
  id: string;
  datum: string;
  beginn: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: Kategorie;
  bestaetigt: boolean;
  ort: OrtDto;
  /** Von der Kirmesgesellschaft hinterlegter Festplatz */
  festplatz: { lat: number; lon: number } | null;
  /** Band oder DJ des Abends */
  band: string | null;
  /** Pfarrer/in beim Gottesdienst (Issue #175) */
  pfarrer?: string | null;
  /** Plakat: Stand für die Bildadresse, null = keins (Issue #297) */
  plakat?: string | null;
  /** Endzeit HH:MM, null = keine; vor Beginn = nach Mitternacht (Issue #286) */
  ende?: string | null;
  /** Veranstalter, falls nicht die Kirmesgesellschaft (Issue #278) */
  veranstalter?: string | null;
  /** Eintritt in Cent, 0 = frei, null = unbekannt (Issue #278) */
  eintrittCent?: number | null;
  /** Hinweise der Kirmesgesellschaft (Eintritt, Programm, Einlass …) */
  info: string | null;
  /** Minderjährige brauchen eine Erziehungsbeauftragung (Muttizettel) */
  muttizettel: boolean;
  /** Mittagstisch – nur in der Einzelansicht (Issue #66) */
  speisen?: { name: string; preisCent: number | null }[];
}

export interface TerminSeite {
  gesamt: number;
  termine: TerminDto[];
}

export interface TerminSuche {
  von?: string;
  bis?: string;
  landkreis?: string[];
  kategorie?: string[];
  q?: string;
  ort?: string;
  bestaetigt?: boolean;
  limit?: number;
  offset?: number;
}

/** API nicht erreichbar oder Serverfehler – wird in der Middleware zu einer 503-Seite. */
export class ApiNichtErreichbar extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Die Termin-API ist nicht erreichbar', options);
    this.name = 'ApiNichtErreichbar';
  }
}

/** Fachlicher Fehler der API (400) – z. B. ungültiger Filter in der URL. */
export class UngueltigeAnfrage extends Error {
  constructor(readonly fehler: { feld: string; code: string; meldung: string }[]) {
    super('Ungültige Anfrage');
    this.name = 'UngueltigeAnfrage';
  }
}

/** Bild als Rohbytes (Plakat, Beitragsfoto); null = keins. */
async function holeBild(pfad: string): Promise<ArrayBuffer | null> {
  let res: Response;
  try {
    res = await fetch(new URL(pfad, API_URL), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new ApiNichtErreichbar();
  return res.arrayBuffer();
}

/** Plakat als WebP (Issue #297); null = keins. */
export const holePlakat = (id: string, groesse: 'gross' | 'klein') =>
  holeBild(`/api/v1/termine/${encodeURIComponent(id)}/plakat/${groesse}`);

/** Foto eines veröffentlichten Beitrags als WebP (Issue #352); null = keins. */
export const holeBeitragFoto = (id: string, groesse: 'gross' | 'klein') =>
  holeBild(`/api/v1/beitraege/fotos/${encodeURIComponent(id)}/${groesse}`);

async function hole<T>(pfad: string, params?: URLSearchParams): Promise<T | null> {
  const url = new URL(pfad, API_URL);
  if (params) url.search = params.toString();
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  if (res.status === 404) return null;
  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { fehler?: UngueltigeAnfrage['fehler'] };
    throw new UngueltigeAnfrage(body.fehler ?? []);
  }
  if (!res.ok) throw new ApiNichtErreichbar({ cause: new Error(`HTTP ${res.status}`) });
  return (await res.json()) as T;
}

function alsParameter(s: TerminSuche): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p;
}

export const sucheTermine = async (s: TerminSuche): Promise<TerminSeite> =>
  (await hole<TerminSeite>('/api/v1/termine', alsParameter(s))) ?? { gesamt: 0, termine: [] };

/** Alle Treffer seitenweise (für iCal, Ortsseiten) – die API liefert max. 200 je Seite. */
export async function alleTermine(s: Omit<TerminSuche, 'limit' | 'offset'>): Promise<TerminDto[]> {
  const alle: TerminDto[] = [];
  // Höchstens 50 Seiten; fehlt „gesamt“ in der Antwort, nicht weiterblättern (keine Endlosschleife)
  for (let offset = 0; offset < 50 * 200; offset += 200) {
    const seite = await sucheTermine({ ...s, limit: 200, offset });
    alle.push(...seite.termine);
    if (!(alle.length < seite.gesamt) || !seite.termine.length) return alle;
  }
  return alle;
}

export const findeTermin = (id: string): Promise<TerminDto | null> =>
  hole<TerminDto>(`/api/v1/termine/${encodeURIComponent(id)}`);

export const listeOrte = async (): Promise<OrtUebersichtDto[]> =>
  (await hole<OrtUebersichtDto[]>('/api/v1/orte')) ?? [];

export const findeOrt = (slug: string): Promise<OrtDto | null> =>
  hole<OrtDto>(`/api/v1/orte/${encodeURIComponent(slug)}`);

/** JSON-Body der Bearbeitungsseite lesen (max. 4 KB). */
/** Veröffentlichte Beiträge (Issue #352), neueste zuerst; `vor` blättert weiter. */
export async function holeBeitraege(
  f: { ort?: string; vor?: string; limit?: number } = {},
): Promise<Beitrag[]> {
  const p = new URLSearchParams();
  if (f.ort) p.set('ort', f.ort);
  if (f.vor) p.set('vor', f.vor);
  if (f.limit) p.set('limit', String(f.limit));
  return (await hole<Beitrag[]>('/api/v1/beitraege', p)) ?? [];
}

export async function leseJson(
  request: Request,
  max = 4_096,
): Promise<{ body: unknown } | Response> {
  const text = await request.text();
  if (text.length > max) return new Response(null, { status: 413 });
  try {
    return { body: JSON.parse(text) };
  } catch {
    return new Response(null, { status: 400 });
  }
}

export const eingabeVorschlaege = async () =>
  (await hole<{ bands: string[]; titel: string[] }>('/api/v1/eingabe-vorschlaege')) ?? {
    bands: [],
    titel: [],
  };

/**
 * Push-Abo (Issue #348) an die API weiterreichen. Der Browser spricht nie direkt mit der API.
 * 404 = Push ist auf dem Server (noch) nicht eingerichtet.
 */
export async function pushAnApi(
  methode: 'GET' | 'PUT' | 'DELETE',
  pfad: 'schluessel' | 'abo',
  body?: unknown,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/push/${pfad}`, API_URL), {
      method: methode,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ApiNichtErreichbar({ cause: e });
  }
  return new Response(res.status === 204 ? null : await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
