/**
 * Rücksprung in die Redaktionsliste (Issue #90): Nach Speichern, Bestätigen oder Löschen landet
 * man wieder in derselben gefilterten Liste, die betroffenen Termine sind hervorgehoben.
 * Rücksprungziele kommen aus der URL – daher nur /admin mit bekannten Filtern, nie fremde Ziele.
 */
const FILTER = ['q', 'datum', 'von', 'zeitraum', 'ort', 'offset'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MARKIERT_MAX = 20;

/** Nur die Listenfilter aus einem (fremd gelieferten) Rücksprungziel übernehmen. */
export function listenFilter(zurueck: string | null | undefined): URLSearchParams {
  const p = new URLSearchParams();
  if (!zurueck) return p;
  let url: URL;
  try {
    url = new URL(zurueck, 'http://redaktion.invalid');
  } catch {
    return p;
  }
  if (url.origin !== 'http://redaktion.invalid' || url.pathname !== '/admin') return p;
  for (const k of FILTER) {
    const v = url.searchParams.get(k);
    if (v) p.set(k, v.slice(0, 100));
  }
  return p;
}

/** Relativer Link auf die aktuelle Liste, zum Mitgeben als `zurueck`. */
export function zurueckLink(filter: URLSearchParams): string {
  const p = listenFilter(`/admin?${filter}`);
  return p.size ? `/admin?${p}` : '/admin';
}

export type Ergebnis = 'gespeichert' | 'bestaetigt' | 'geloescht';

/** Ziel nach einer Aktion: dieselbe Liste plus Meldung und markierte Termine. */
export function nachAktion(
  zurueck: string | null | undefined,
  ergebnis: Ergebnis,
  ids: string[] = [],
  filter?: Record<string, string>,
): string {
  const p = filter ? new URLSearchParams(filter) : listenFilter(zurueck);
  p.delete('markiert');
  p.set(ergebnis, String(Math.max(1, ids.length)));
  const gueltig = ids.filter((id) => UUID.test(id)).slice(0, MARKIERT_MAX);
  for (const id of gueltig) p.append('markiert', id);
  return `/admin?${p}${gueltig.length === 1 ? `#termin-${gueltig[0]}` : '#terminliste'}`;
}

/** Markierte Termin-IDs aus der URL (nur UUIDs, höchstens 20). */
export function markierte(p: URLSearchParams): string[] {
  return p
    .getAll('markiert')
    .filter((id) => UUID.test(id))
    .slice(0, MARKIERT_MAX);
}

/** Meldung oben in der Liste, mit Anzahl und Ort. */
export function listenMeldung(p: URLSearchParams, ortName?: string): string | null {
  const zahl = (k: Ergebnis) => {
    const n = Number(p.get(k));
    return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 1;
  };
  const wo = ortName ? ` für ${ortName}` : '';
  if (p.has('gespeichert')) {
    const n = zahl('gespeichert');
    return n === 1 ? `Termin${wo} gespeichert.` : `${n} Termine${wo} gespeichert.`;
  }
  if (p.has('bestaetigt')) {
    const n = zahl('bestaetigt');
    return n === 1 ? 'Termin bestätigt.' : `${n} Termine bestätigt.`;
  }
  if (p.has('geloescht')) return 'Termin gelöscht.';
  return null;
}

/** Termine einer Kirmes: gleicher Ort, höchstens `tage` Tage nach dem ersten Termin (Issue #91). */
export interface KirmesGruppe<T> {
  ort: string;
  von: string;
  bis: string;
  termine: T[];
}
export function nachKirmes<T extends { datum: string; ort: { slug: string } }>(
  termine: T[],
  tage = 4,
): KirmesGruppe<T>[] {
  const gruppen: KirmesGruppe<T>[] = [];
  const offen = new Map<string, KirmesGruppe<T>>();
  const sortiert = [...termine].sort((a, b) => a.datum.localeCompare(b.datum));
  for (const t of sortiert) {
    const g = offen.get(t.ort.slug);
    const abstand = g ? (Date.parse(t.datum) - Date.parse(g.von)) / 86_400_000 : Infinity;
    if (g && abstand <= tage) {
      g.termine.push(t);
      g.bis = t.datum;
    } else {
      const neu = { ort: t.ort.slug, von: t.datum, bis: t.datum, termine: [t] };
      gruppen.push(neu);
      offen.set(t.ort.slug, neu);
    }
  }
  return gruppen;
}
