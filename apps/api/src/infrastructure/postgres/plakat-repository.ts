import type { PlakatAblage, PlakatGroesse, Plakatbild } from '@kirmes/core';
import type pg from 'pg';

/** Plakate in der Datenbank (Issue #297) – damit stecken sie automatisch in den Sicherungen. */
const SQL_ORT = `SELECT o.slug FROM termin t JOIN ort o ON o.id = t.ort_id WHERE t.id = $1::uuid`;
const SQL_SPEICHERN = `
INSERT INTO termin_plakat (termin_id, gross, klein, breite, hoehe, hochgeladen_von)
VALUES ($1::uuid, $2, $3, $4, $5, $6)
ON CONFLICT (termin_id) DO UPDATE
   SET gross = EXCLUDED.gross, klein = EXCLUDED.klein, breite = EXCLUDED.breite,
       hoehe = EXCLUDED.hoehe, hochgeladen_am = now(), hochgeladen_von = EXCLUDED.hochgeladen_von`;
const SQL_LOESCHEN = `DELETE FROM termin_plakat WHERE termin_id = $1::uuid`;
const SQL_GROSS = `SELECT gross AS bild FROM termin_plakat WHERE termin_id = $1::uuid`;
const SQL_KLEIN = `SELECT klein AS bild FROM termin_plakat WHERE termin_id = $1::uuid`;
// Termin anfassen (Kalender-Abos und Caches erkennen die Änderung) und protokollieren
const SQL_GEAENDERT = `
WITH t AS (
  UPDATE termin SET geaendert_am = clock_timestamp(), version = version + 1 WHERE id = $1::uuid
  RETURNING ort_id
)
INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details)
SELECT $2, ort_id, $3, jsonb_build_object('id', $1::text) FROM t`;

export class PgPlakate implements PlakatAblage {
  constructor(private readonly db: pg.Pool) {}

  async ortVon(terminId: string): Promise<string | null> {
    return (await this.db.query<{ slug: string }>(SQL_ORT, [terminId])).rows[0]?.slug ?? null;
  }

  private async mitProtokoll(
    terminId: string,
    adminId: string,
    aktion: string,
    schritt: (c: pg.PoolClient) => Promise<number>,
  ): Promise<number> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const n = await schritt(c);
      if (n) await c.query(SQL_GEAENDERT, [terminId, adminId, aktion]);
      await c.query('COMMIT');
      return n;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async speichere(terminId: string, b: Plakatbild, adminId: string): Promise<void> {
    await this.mitProtokoll(terminId, adminId, 'plakat_gespeichert', async (c) => {
      const r = await c.query(SQL_SPEICHERN, [
        terminId,
        Buffer.from(b.gross),
        Buffer.from(b.klein),
        b.breite,
        b.hoehe,
        adminId,
      ]);
      return Number(r.rowCount);
    });
  }

  async loesche(terminId: string, adminId: string): Promise<boolean> {
    const n = await this.mitProtokoll(terminId, adminId, 'plakat_geloescht', async (c) =>
      Number((await c.query(SQL_LOESCHEN, [terminId])).rowCount),
    );
    return n > 0;
  }

  async lade(terminId: string, groesse: PlakatGroesse): Promise<Uint8Array | null> {
    const r = await this.db.query<{ bild: Buffer }>(groesse === 'gross' ? SQL_GROSS : SQL_KLEIN, [
      terminId,
    ]);
    return r.rows[0]?.bild ?? null;
  }
}
