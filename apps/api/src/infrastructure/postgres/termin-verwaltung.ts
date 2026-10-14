import type { Berechtigung, NeuerTermin, Termin, TerminVerwaltung } from '@kirmes/core';
import type pg from 'pg';

/*
 * Schreibzugriffe der Kirmesgesellschaften. Jede Anweisung prüft im WHERE, dass der Termin zum Ort
 * des Bearbeitungslinks gehört – eine fremde Termin-ID bewirkt nichts. Jede Änderung wird protokolliert.
 */
const SQL_ANLEGEN = `
INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, quelle, eingetragen_durch)
SELECT o.id, $2::date, $3::time, $4, $5, $6, true, 'Kirmesgesellschaft', $7
  FROM ort o WHERE o.slug = $1
ON CONFLICT (ort_id, datum, titel) DO UPDATE SET
  beginn = EXCLUDED.beginn, veranstaltungsort = EXCLUDED.veranstaltungsort, kategorie = EXCLUDED.kategorie,
  bestaetigt = true, eingetragen_durch = EXCLUDED.eingetragen_durch, geaendert_am = now()
RETURNING id, ort_id`;

const SQL_AENDERN = `
UPDATE termin t SET datum = $3::date, beginn = $4::time, titel = $5, veranstaltungsort = $6,
       kategorie = $7, bestaetigt = true, eingetragen_durch = $8, geaendert_am = now()
  FROM ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id`;

const SQL_BESTAETIGEN = `
UPDATE termin t SET bestaetigt = true, eingetragen_durch = $3, geaendert_am = now()
  FROM ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id`;

const SQL_LOESCHEN = `
DELETE FROM termin t USING ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id, t.titel, t.datum::text AS datum`;

const SQL_PROTOKOLL = `
INSERT INTO aenderungsprotokoll (link_id, ort_id, aktion, details) VALUES ($1, $2, $3, $4)`;

export class PgTerminVerwaltung implements TerminVerwaltung {
  constructor(private readonly db: pg.Pool) {}

  async lege(t: NeuerTermin, durch: Berechtigung): Promise<Termin> {
    return this.inTransaktion(async (c) => {
      const r = await c.query<{ id: string; ort_id: string }>(SQL_ANLEGEN, [
        t.ortSlug,
        t.datum,
        t.beginn,
        t.titel,
        t.veranstaltungsort,
        t.kategorie,
        durch.linkId,
      ]);
      const neu = r.rows[0];
      if (!neu) throw new Error(`Ort ${t.ortSlug} nicht gefunden`);
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        neu.ort_id,
        'termin_angelegt',
        { id: neu.id, ...t },
      ]);
      const ort = await c.query<{ name: string }>('SELECT name FROM ort WHERE id = $1', [
        neu.ort_id,
      ]);
      return {
        id: neu.id,
        ort: {
          slug: t.ortSlug,
          name: ort.rows[0]?.name ?? t.ortSlug,
          landkreis: t.landkreis,
          koordinate: null,
        },
        datum: t.datum,
        beginn: t.beginn,
        titel: t.titel,
        veranstaltungsort: t.veranstaltungsort,
        kategorie: t.kategorie,
        bestaetigt: true,
        festplatz: null,
      };
    });
  }

  aendere(id: string, t: NeuerTermin, durch: Berechtigung): Promise<boolean> {
    return this.mitProtokoll(
      SQL_AENDERN,
      [
        id,
        durch.ortSlug,
        t.datum,
        t.beginn,
        t.titel,
        t.veranstaltungsort,
        t.kategorie,
        durch.linkId,
      ],
      durch,
      'termin_geaendert',
      { id, ...t },
    );
  }

  bestaetige(id: string, durch: Berechtigung): Promise<boolean> {
    return this.mitProtokoll(
      SQL_BESTAETIGEN,
      [id, durch.ortSlug, durch.linkId],
      durch,
      'termin_bestaetigt',
      {
        id,
      },
    );
  }

  loesche(id: string, durch: Berechtigung): Promise<boolean> {
    return this.mitProtokoll(SQL_LOESCHEN, [id, durch.ortSlug], durch, 'termin_geloescht', { id });
  }

  private mitProtokoll(
    sql: string,
    werte: unknown[],
    durch: Berechtigung,
    aktion: string,
    details: object,
  ): Promise<boolean> {
    return this.inTransaktion(async (c) => {
      const r = await c.query<{ ort_id: string }>(sql, werte);
      const zeile = r.rows[0];
      if (!zeile) return false;
      await c.query(SQL_PROTOKOLL, [durch.linkId, zeile.ort_id, aktion, { ...details, ...zeile }]);
      return true;
    });
  }

  private async inTransaktion<T>(arbeit: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const ergebnis = await arbeit(c);
      await c.query('COMMIT');
      return ergebnis;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
