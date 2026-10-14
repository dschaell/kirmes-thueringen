/**
 * Datenzugriff des Client-Tiers: ausschließlich über die HTTP-API des Server-Tiers.
 * Läuft nur serverseitig (SSR) – der Browser spricht nie direkt mit der API.
 */
import type { Kategorie, LandkreisKuerzel } from '@kirmes/core';

/** Interne Adresse der API: lokal http://127.0.0.1:3100, im Container-Netz http://api:3100 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';
const TIMEOUT_MS = 5_000;

export interface OrtDto {
  slug: string;
  name: string;
  landkreis: LandkreisKuerzel;
  koordinate: { lat: number; lon: number } | null;
}

export interface OrtUebersichtDto extends OrtDto {
  anzahlKommend: number;
}

export interface TerminDto {
  id: string;
  datum: string;
  beginn: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: Kategorie;
  bestaetigt: boolean;
  ort: OrtDto;
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
  for (let offset = 0; ; offset += 200) {
    const seite = await sucheTermine({ ...s, limit: 200, offset });
    alle.push(...seite.termine);
    if (alle.length >= seite.gesamt || !seite.termine.length) return alle;
  }
}

export const listeOrte = async (): Promise<OrtUebersichtDto[]> =>
  (await hole<OrtUebersichtDto[]>('/api/v1/orte')) ?? [];

export const findeOrt = (slug: string): Promise<OrtDto | null> =>
  hole<OrtDto>(`/api/v1/orte/${encodeURIComponent(slug)}`);
