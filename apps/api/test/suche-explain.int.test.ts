/** EXPLAIN-Regressionstest: Freitextsuche nutzt den Trigramm-Index statt eines Seq Scans. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erstellePool } from '../src/infrastructure/postgres/pool.js';
import { erzeugeLastdaten, LAST_PRAEFIX } from '../src/infrastructure/postgres/lastdaten.js';
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
   * ~100.000 Zeilen nimmt er den Index von selbst). Der Test prüft daher, ob die Abfrageform den
   * Index NUTZEN KANN – mit abgeschaltetem Seq Scan. Wird die Suche so umgebaut, dass kein Index
   * mehr passt (z. B. ILIKE über eine Ausdruckskette ohne Index), schlägt er an.
   */
  const planOhneSeqScan = async (suchtext: string) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL enable_seqscan = off');
      const { rows } = await c.query<{ 'QUERY PLAN': { Plan: Plan }[] }>(SQL_SUCHE_EXPLAIN, [
        '2026-01-01',
        '2026-12-31',
        [],
        [],
        suchtext,
        false,
        50,
        0,
        null,
      ]);
      return knoten(rows[0]!['QUERY PLAN'][0]!.Plan);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  };

  it('Freitext kann die Trigramm-Indizes nutzen (kein Seq Scan auf termin nötig)', async () => {
    const p = await planOhneSeqScan('%kirmestanz 1234%');
    const termin = p.filter((k) => k['Relation Name'] === 'termin');
    expect(termin.map((k) => k['Node Type'])).not.toContain('Seq Scan');
    const indizes = p.map((k) => (k as Plan & { 'Index Name'?: string })['Index Name']);
    expect(indizes).toContain('termin_suchtext_trgm_idx');
    expect(indizes).toContain('ort_name_trgm_idx');
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
});
