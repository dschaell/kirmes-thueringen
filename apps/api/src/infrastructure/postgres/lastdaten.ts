/**
 * Testdaten für Lasttest und EXPLAIN-Regressionstest: Orte in allen 23 Landkreisen und Termine
 * über ein Jahr. Jeder Termin läuft durch die Domänen-Factory `validiereTermin` – keine Rohdaten
 * am Core vorbei. Fester Seed → reproduzierbar. Nur gegen Test- oder Lastdatenbanken.
 *
 * Kommandozeile: lastdaten-cli.ts
 */
import { LANDKREISE, validiereTermin, type NeuerTermin } from '@kirmes/core';
import type pg from 'pg';

const SQL_TERMINE_EINFUEGEN = `
INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, band)
SELECT * FROM unnest($1::bigint[], $2::date[], $3::time[], $4::text[], $5::text[], $6::text[],
                     $7::boolean[], $8::text[])
ON CONFLICT DO NOTHING`;

/** Präfix aller erzeugten Orte – damit lassen sie sich gezielt wieder löschen. */
export const LAST_PRAEFIX = 'last-';

const TITEL = [
  'Kirmestanz',
  'Kirmesdisco',
  'Kindertanz',
  'Frühschoppen',
  'Kirmesumzug',
  'Kirmesausklang',
  'Kirmesbeerdigung',
  'Ständchen',
];
const BANDS = ['Belconda', 'Excite', 'DJ Wirbelwind', 'Saitensprung', 'Partyband XY', null, null];
const ORTE = ['Grund', 'Berg', 'Tal', 'Bach', 'Feld', 'Au', 'Rode', 'Hausen', 'Dorf', 'Leben'];

/** Deterministischer Zufall (mulberry32) */
function zufall(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function erzeugeLastdaten(
  db: pg.Pool,
  { termine = 10_000, orte = 900, jahr = 2026, seed = 42 } = {},
): Promise<{ orte: number; termine: number }> {
  const r = zufall(seed);
  const wahl = <T>(liste: readonly T[]) => liste[Math.floor(r() * liste.length)] as T;
  const kreise = Object.keys(LANDKREISE);
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM ort WHERE slug LIKE $1', [`${LAST_PRAEFIX}%`]);
    const ortListe: { id: string; slug: string; landkreis: string }[] = [];
    for (let i = 0; i < orte; i++) {
      const landkreis = kreise[i % kreise.length] as string;
      const slug = `${LAST_PRAEFIX}${String(i).padStart(4, '0')}`;
      const name = `Last${wahl(ORTE)}${i}`;
      // Koordinaten in Thüringen (grob 50,2–51,6 N, 9,9–12,6 O)
      const res = await c.query<{ id: string }>(
        `INSERT INTO ort (slug, name, landkreis, lage)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)) RETURNING id::text`,
        [slug, name, landkreis, 9.9 + r() * 2.7, 50.2 + r() * 1.4],
      );
      const neu = res.rows[0];
      if (!neu) throw new Error(`Ort ${slug} nicht angelegt`);
      ortListe.push({ id: neu.id, slug, landkreis });
    }
    const zeilen: { ortId: string; t: NeuerTermin }[] = [];
    while (zeilen.length < termine) {
      const ort = wahl(ortListe);
      const tag = new Date(Date.UTC(jahr, 0, 1 + Math.floor(r() * 365)));
      const v = validiereTermin({
        ortSlug: ort.slug,
        landkreis: ort.landkreis,
        datum: tag.toISOString().slice(0, 10),
        beginn: `${String(10 + Math.floor(r() * 12)).padStart(2, '0')}:00`,
        titel: `${wahl(TITEL)} ${zeilen.length}`,
        veranstaltungsort: wahl(['Festzelt', 'Saal', 'Sportplatz', 'Kulturhaus', null]),
        kategorie: 'party',
        bestaetigt: r() < 0.5,
        band: wahl(BANDS),
      });
      if (v.ok) zeilen.push({ ortId: ort.id, t: v.value.termin });
    }
    // Ein statisches INSERT mit Arrays (unnest) – validierte Werte, nur Platzhalter
    const spalte = <K extends keyof NeuerTermin>(k: K) => zeilen.map(({ t }) => t[k]);
    await c.query(SQL_TERMINE_EINFUEGEN, [
      zeilen.map((z) => z.ortId),
      spalte('datum'),
      spalte('beginn'),
      spalte('titel'),
      spalte('veranstaltungsort'),
      spalte('kategorie'),
      spalte('bestaetigt'),
      spalte('band'),
    ]);
    await c.query('COMMIT');
    await c.query('ANALYZE ort; ANALYZE termin;');
    return { orte: ortListe.length, termine: zeilen.length };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Lastdaten nur in Datenbanken, deren Name auf _test oder _perf endet – nie in die Arbeitsdaten. */
export function istLastdatenbank(url: string): boolean {
  try {
    return /_(test|perf)$/.test(new URL(url).pathname.slice(1));
  } catch {
    return false;
  }
}
