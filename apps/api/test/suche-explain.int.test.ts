/** EXPLAIN-Regressionstest: Freitextsuche nutzt den Trigramm-Index statt eines Seq Scans. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erstellePool } from '../src/infrastructure/postgres/pool.js';
import {
  erzeugeLastdaten,
  istLastdatenbank,
  LAST_PRAEFIX,
} from '../src/infrastructure/postgres/lastdaten.js';
import {
  PgTerminRepository,
  SQL_SUCHE_EXPLAIN,
} from '../src/infrastructure/postgres/termin-repository.js';
import type { KalenderDatum } from '@kirmes/core';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();

interface Plan {
  'Node Type': string;
  'Relation Name'?: string;
  Plans?: Plan[];
}
const knoten = (p: Plan): Plan[] => [p, ...(p.Plans ?? []).flatMap(knoten)];

describe.runIf(url)('Suche bei 10.000 Terminen (PostgreSQL)', () => {
  const pool = erstellePool({
    connectionString: url ?? '',
    ssl: false,
    maxVerbindungen: 2,
    statementTimeoutMs: 60_000,
  });

  beforeAll(async () => {
    const e = await erzeugeLastdaten(pool, { termine: 10_000, orte: 900 });
    expect(e).toEqual({ orte: 900, termine: 10_000 });
  }, 120_000);
  afterAll(async () => {
    await pool.query('DELETE FROM ort WHERE slug LIKE $1', [`${LAST_PRAEFIX}%`]);
    await pool.end();
  });

  /**
   * Bei 10.000 Zeilen ist die Tabelle so klein, dass der Planer zu Recht den Seq Scan wählt (ab
   * ~100.000 Zeilen nimmt er den Index von selbst); welchen Ersatzplan er bei abgeschaltetem Seq
   * Scan nimmt, hängt von der Umgebung ab. Geprüft wird daher zweierlei:
   * 1. Die Suche filtert genau über die indexierten Ausdrücke (suchtext, ort.name).
   * 2. Für diese Ausdrücke allein ist der Trigramm-Index nutzbar.
   */
  const indexBei = async (sql: string, muster: string) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL enable_seqscan = off');
      const { rows } = await c.query<{ 'QUERY PLAN': { Plan: Plan }[] }>(sql, [muster]);
      return knoten(rows[0]!['QUERY PLAN'][0]!.Plan).map(
        (k) => (k as Plan & { 'Index Name'?: string })['Index Name'],
      );
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  };

  it('Freitext filtert über die indexierten Ausdrücke', () => {
    expect(SQL_SUCHE_EXPLAIN).toContain("t.suchtext ILIKE $5 ESCAPE '\\'");
    expect(SQL_SUCHE_EXPLAIN).toContain("FROM ort WHERE name ILIKE $5 ESCAPE '\\'");
  });

  it('Trigramm-Indizes sind für diese Ausdrücke nutzbar', async () => {
    expect(
      await indexBei(
        "EXPLAIN (FORMAT JSON) SELECT t.id FROM termin t WHERE t.suchtext ILIKE $1 ESCAPE '\\'",
        '%kirmestanz 1234%',
      ),
    ).toContain('termin_suchtext_trgm_idx');
    expect(
      await indexBei(
        "EXPLAIN (FORMAT JSON) SELECT id FROM ort WHERE name ILIKE $1 ESCAPE '\\'",
        '%lastgrund%',
      ),
    ).toContain('ort_name_trgm_idx');
  });

  it('findet Termine über Band, Titel und Ortsname', async () => {
    const repo = new PgTerminRepository(pool);
    const zaehle = async (suchtext: string) =>
      (
        await repo.suche({
          bereich: { von: '2026-01-01' as KalenderDatum, bis: '2026-12-31' as KalenderDatum },
          landkreise: [],
          kategorien: [],
          suchtext,
          nurBestaetigt: false,
          limit: 1,
          offset: 0,
          ortSlug: null,
        })
      ).gesamt;
    expect(await zaehle('belconda')).toBeGreaterThan(0);
    expect(await zaehle('frühschoppen')).toBeGreaterThan(0);
    expect(await zaehle('lastgrund')).toBeGreaterThan(0);
  });

  it('bricht bei einem Fehler komplett ab (Rollback)', async () => {
    // ohne Orte gibt es keinen Ort für die Termine → Fehler mitten im Einfügen
    await expect(erzeugeLastdaten(pool, { termine: 1, orte: 0 })).rejects.toThrow();
    // die vorherigen Lastdaten sind unverändert da (DELETE wurde zurückgerollt)
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM ort WHERE slug LIKE $1', [
      `${LAST_PRAEFIX}%`,
    ]);
    expect(rows[0].n).toBe(900);
  });
});

describe('Schutz der Arbeitsdatenbank', () => {
  it('Lastdaten nur in *_test oder *_perf', () => {
    expect(istLastdatenbank('postgres://h:5432/kirmes_test')).toBe(true);
    expect(istLastdatenbank('postgres://h:5432/kirmes_perf')).toBe(true);
    expect(istLastdatenbank('postgres://h:5432/kirmes')).toBe(false);
    expect(istLastdatenbank('kein-url')).toBe(false);
  });
});
