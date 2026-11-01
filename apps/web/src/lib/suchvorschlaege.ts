/**
 * Vorschläge beim Tippen im Suchfeld „Ort oder Band“ (Issue #370): schon ab dem ersten Buchstaben.
 * Reihenfolge: Orte mit kommenden Terminen, Bands mit kommenden Terminen, alle übrigen Orte –
 * innerhalb davon Namensanfang vor Wortanfang vor „irgendwo“. Antippen öffnet das Ziel direkt.
 */
import { bezeichner, normalisiere, type OrtKurz } from './ortssuche';

export interface SuchVorschlag {
  wert: string;
  /** kleine Zeile darunter, z. B. „3 Termine“ oder „Band · 2 Termine“ */
  zusatz: string;
  ziel: string;
}
export interface OrtMitTerminen extends OrtKurz {
  anzahlKommend: number;
}

/** 0 = gleich, 1 = Namensanfang, 2 = Wortanfang, 3 = irgendwo (erst ab 3 Zeichen), -1 = nein */
function rang(text: string, n: string): number {
  const t = normalisiere(text);
  if (t === n) return 0;
  if (t.startsWith(n)) return 1;
  if (t.split(' ').some((w) => w.startsWith(n))) return 2;
  return n.length >= 3 && t.includes(n) ? 3 : -1;
}

const termine = (n: number) => (n === 1 ? '1 Termin' : `${n} Termine`);

export function schlageVor(
  orte: OrtMitTerminen[],
  bands: ReadonlyMap<string, number>,
  q: string,
  { max = 8, nurOrte = false }: { max?: number; nurOrte?: boolean } = {},
): SuchVorschlag[] {
  const n = normalisiere(q);
  if (!n) return [];
  const name = bezeichner(orte);
  type Kandidat = SuchVorschlag & { gruppe: number; r: number };
  const kandidaten: Kandidat[] = [];
  for (const o of orte) {
    const r = rang(o.name, n);
    if (r < 0) continue;
    const mit = o.anzahlKommend > 0;
    kandidaten.push({
      wert: mit ? o.name : name(o),
      zusatz: mit ? termine(o.anzahlKommend) : 'noch keine Termine',
      ziel: `/orte/${o.slug}`,
      gruppe: mit ? 0 : 2,
      r,
    });
  }
  if (!nurOrte)
    for (const [band, anzahl] of bands) {
      const r = rang(band, n);
      if (r >= 0)
        kandidaten.push({
          wert: band,
          zusatz: `Band · ${termine(anzahl)}`,
          ziel: `/termine?q=${encodeURIComponent(band)}`,
          gruppe: 1,
          r,
        });
    }
  return kandidaten
    .sort((a, b) => a.gruppe - b.gruppe || a.r - b.r || a.wert.localeCompare(b.wert, 'de'))
    .slice(0, max)
    .map(({ wert, zusatz, ziel }) => ({ wert, zusatz, ziel }));
}

/** Bands aus den kommenden Terminen zählen; Schreibweise der ersten Nennung gewinnt. */
export function zaehleBands(liste: readonly string[][]): Map<string, number> {
  const anzeige = new Map<string, string>();
  const zahl = new Map<string, number>();
  for (const bands of liste)
    for (const b of new Set(bands)) {
      const k = normalisiere(b);
      if (!k) continue;
      if (!anzeige.has(k)) anzeige.set(k, b);
      zahl.set(k, (zahl.get(k) ?? 0) + 1);
    }
  return new Map([...anzeige].map(([k, b]) => [b, zahl.get(k) ?? 0]));
}
