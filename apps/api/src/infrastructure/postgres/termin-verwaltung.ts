import type { Berechtigung, NeuerTermin, Termin, TerminVerwaltung } from '@kirmes/core';
import type pg from 'pg';

/*
 * Schreibzugriffe der Kirmesgesellschaften und der Redaktion. Jede Anweisung prüft im WHERE, dass der
 * Termin zum Ort der Berechtigung gehört – eine fremde Termin-ID bewirkt nichts. Jede Änderung wird
 * protokolliert (Bearbeitungslink oder Admin).
 */
const SQL_ANLEGEN = `
INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, quelle,
                    eingetragen_durch, eingetragen_von_admin, band, info, muttizettel)
SELECT o.id, $2::date, $3::time, $4, $5, $6, $8,
       CASE WHEN $7::bigint IS NULL THEN 'Redaktion' ELSE 'Kirmesgesellschaft' END, $7, $9, $10, $11, $12
  FROM ort o WHERE o.slug = $1
ON CONFLICT (ort_id, datum, titel) DO UPDATE SET
  beginn = EXCLUDED.beginn, veranstaltungsort = EXCLUDED.veranstaltungsort, kategorie = EXCLUDED.kategorie,
  bestaetigt = termin.bestaetigt OR EXCLUDED.bestaetigt, eingetragen_durch = EXCLUDED.eingetragen_durch,
  eingetragen_von_admin = EXCLUDED.eingetragen_von_admin, band = EXCLUDED.band, info = EXCLUDED.info,
  muttizettel = EXCLUDED.muttizettel,
  geaendert_am = now()
RETURNING id, ort_id, (SELECT name FROM ort WHERE id = termin.ort_id) AS ort_name`;

const SQL_AENDERN = `
UPDATE termin t SET datum = $3::date, beginn = $4::time, titel = $5, veranstaltungsort = $6,
       kategorie = $7, bestaetigt = $9, eingetragen_durch = $8, eingetragen_von_admin = $10,
       band = $11, info = $12, muttizettel = $13, geaendert_am = now()
  FROM ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id`;

const SQL_BESTAETIGEN = `
UPDATE termin t SET bestaetigt = true, eingetragen_durch = $3, eingetragen_von_admin = $4,
       geaendert_am = now()
  FROM ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id`;

const SQL_LOESCHEN = `
DELETE FROM termin t USING ort o
 WHERE t.id = $1::uuid AND t.ort_id = o.id AND o.slug = $2
RETURNING t.ort_id, t.titel, t.datum::text AS datum`;

const SQL_PROTOKOLL = `
INSERT INTO aenderungsprotokoll (link_id, admin_id, ort_id, aktion, details) VALUES ($1, $2, $3, $4, $5)`;

export class PgTerminVerwaltung implements TerminVerwaltung {
  constructor(private readonly db: pg.Pool) {}

  lege(t: NeuerTermin, durch: Berechtigung): Promise<Termin> {
    return this.inTransaktion((c) => this.legeMit(c, t, durch));
  }

  /** Alle oder keiner: Scheitert ein Termin, wird die ganze Transaktion zurückgerollt. */
  legeAlle(termine: NeuerTermin[], durch: Berechtigung): Promise<Termin[]> {
    return this.inTransaktion(async (c) => {
      const ergebnis: Termin[] = [];
      for (const t of termine) ergebnis.push(await this.legeMit(c, t, durch));
      return ergebnis;
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
        t.bestaetigt,
        durch.adminId ?? null,
        t.band,
        t.info,
        t.muttizettel ?? false,
      ],
      durch,
      'termin_geaendert',
      { id, ...t },
    );
  }

  bestaetige(id: string, durch: Berechtigung): Promise<boolean> {
    return this.mitProtokoll(
      SQL_BESTAETIGEN,
      [id, durch.ortSlug, durch.linkId, durch.adminId ?? null],
      durch,
      'termin_bestaetigt',
      { id },
    );
  }

  loesche(id: string, durch: Berechtigung): Promise<boolean> {
    return this.mitProtokoll(SQL_LOESCHEN, [id, durch.ortSlug], durch, 'termin_geloescht', { id });
  }

  private async legeMit(c: pg.PoolClient, t: NeuerTermin, durch: Berechtigung): Promise<Termin> {
    const r = await c.query<{ id: string; ort_id: string; ort_name: string }>(SQL_ANLEGEN, [
      t.ortSlug,
      t.datum,
      t.beginn,
      t.titel,
      t.veranstaltungsort,
      t.kategorie,
      durch.linkId,
      t.bestaetigt,
      durch.adminId ?? null,
      t.band,
      t.info,
      t.muttizettel ?? false,
    ]);
    const neu = r.rows[0];
    if (!neu) throw new Error(`Ort ${t.ortSlug} nicht gefunden`);
    await c.query(SQL_PROTOKOLL, [
      durch.linkId,
      durch.adminId ?? null,
      neu.ort_id,
      'termin_angelegt',
      { id: neu.id, ...t },
    ]);
    return {
      id: neu.id,
      ort: { slug: t.ortSlug, name: neu.ort_name, landkreis: t.landkreis, koordinate: null },
      datum: t.datum,
      beginn: t.beginn,
      titel: t.titel,
      veranstaltungsort: t.veranstaltungsort,
      kategorie: t.kategorie,
      bestaetigt: t.bestaetigt,
      festplatz: null,
      band: t.band,
      info: t.info,
      muttizettel: t.muttizettel ?? false,
    };
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
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        durch.adminId ?? null,
        zeile.ort_id,
        aktion,
        { ...details, ...zeile },
      ]);
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
