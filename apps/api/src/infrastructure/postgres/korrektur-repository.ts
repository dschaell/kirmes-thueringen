import type { Korrektur, KorrekturRepository, NeueKorrektur } from '@kirmes/core';
import type pg from 'pg';

/** Höchstens so viele offene Hinweise je Termin – gegen Fluten eines einzelnen Termins */
const MAX_OFFEN_JE_TERMIN = 20;

export class PgKorrekturen implements KorrekturRepository {
  constructor(private readonly db: pg.Pool) {}
  async lege(k: NeueKorrektur) {
    const r = await this.db.query(
      `INSERT INTO korrektur(termin_id, text, kontakt_name, kontakt_email)
       SELECT t.id, $2, $3, $4 FROM termin t WHERE t.id = $1::uuid
         AND (SELECT count(*) FROM korrektur WHERE termin_id = t.id AND erledigt_am IS NULL) < $5`,
      [k.terminId, k.text, k.kontaktName, k.kontaktEmail, MAX_OFFEN_JE_TERMIN],
    );
    return r.rowCount === 1;
  }
  async liste(): Promise<Korrektur[]> {
    const r = await this.db.query<Korrektur>(
      `SELECT k.id, k.erstellt_am::text AS "erstelltAm", k.text, k.kontakt_name AS "kontaktName",
         k.kontakt_email AS "kontaktEmail",
         jsonb_build_object('id', t.id, 'titel', t.titel, 'datum', t.datum::text,
           'beginn', to_char(t.beginn, 'HH24:MI'), 'ortName', o.name, 'ortSlug', o.slug) AS termin
       FROM korrektur k JOIN termin t ON t.id = k.termin_id JOIN ort o ON o.id = t.ort_id
       WHERE k.erledigt_am IS NULL ORDER BY k.erstellt_am LIMIT 100`,
    );
    return r.rows;
  }
  async anzahl() {
    const r = await this.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM korrektur WHERE erledigt_am IS NULL',
    );
    return r.rows[0]?.n ?? 0;
  }
  async erledige(id: string, adminId: string) {
    // datenaenderung-freigegeben: #107 – nur der neue Korrekturhinweis; Kontakt wird gelöscht.
    const r = await this.db.query(
      `UPDATE korrektur SET erledigt_am = now(), erledigt_von = $2, kontakt_name = NULL,
         kontakt_email = NULL WHERE id = $1::uuid AND erledigt_am IS NULL`,
      [id, adminId],
    );
    return r.rowCount === 1;
  }
  async raeumeAuf() {
    // datenaenderung-freigegeben: #107 – nur Korrekturhinweise, niemals Termine.
    await this.db.query(`DELETE FROM korrektur WHERE
      (erledigt_am IS NULL AND erstellt_am < now() - interval '180 days') OR
      (erledigt_am < now() - interval '30 days')`);
  }
}
