import type { Aufruf, Zugriffsstatistik, ZugriffsAblage } from '@kirmes/core';
import type pg from 'pg';

/** Zugriffszahlen (Issue #311): nur Tag, Pfad, Anzahl – Tag nach Thüringer Ortszeit. */
const SQL_ERFASSEN = `
INSERT INTO seitenaufruf (tag, pfad, anzahl)
SELECT (now() AT TIME ZONE 'Europe/Berlin')::date, e.pfad, e.anzahl
  FROM unnest($1::text[], $2::int[]) AS e(pfad, anzahl)
ON CONFLICT (tag, pfad) DO UPDATE SET anzahl = seitenaufruf.anzahl + EXCLUDED.anzahl`;
const SQL_TAGE = `
SELECT tag::text, sum(anzahl)::int AS anzahl FROM seitenaufruf
 WHERE tag > (now() AT TIME ZONE 'Europe/Berlin')::date - $1::int
 GROUP BY tag ORDER BY tag DESC`;
const SQL_SEITEN = `
SELECT pfad, sum(anzahl)::int AS anzahl FROM seitenaufruf
 WHERE tag > (now() AT TIME ZONE 'Europe/Berlin')::date - $1::int
 GROUP BY pfad ORDER BY anzahl DESC, pfad LIMIT 30`;
// datenaenderung-freigegeben: #311 – alte Zählungen nach Ablauf der Aufbewahrung löschen
const SQL_AUFRAEUMEN = `
DELETE FROM seitenaufruf WHERE tag < (now() AT TIME ZONE 'Europe/Berlin')::date - $1::int`;

export class PgZugriffe implements ZugriffsAblage {
  constructor(private readonly db: pg.Pool) {}

  async erfasse(aufrufe: Aufruf[]): Promise<void> {
    await this.db.query(SQL_ERFASSEN, [aufrufe.map((a) => a.pfad), aufrufe.map((a) => a.anzahl)]);
  }

  async statistik(tage: number): Promise<Zugriffsstatistik> {
    const [t, s] = await Promise.all([
      this.db.query<{ tag: string; anzahl: number }>(SQL_TAGE, [tage]),
      this.db.query<Aufruf>(SQL_SEITEN, [tage]),
    ]);
    return { tage: t.rows, seiten: s.rows };
  }

  async raeumeAuf(tage: number): Promise<void> {
    await this.db.query(SQL_AUFRAEUMEN, [tage]);
  }
}
