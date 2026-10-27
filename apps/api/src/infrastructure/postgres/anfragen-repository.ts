import type { Anfrage, AnfragenRepository, NeueAnfrage } from '@kirmes/core';
import type pg from 'pg';

const SQL_LISTE = `
SELECT a.id, a.eingegangen_am::text AS "eingegangenAm", a.name, a.email, a.ort, a.info,
       a.status, a.erledigt_am::text AS "erledigtAm", m.name AS "erledigtVon"
  FROM mitmach_anfrage a LEFT JOIN admin m ON m.id = a.erledigt_von
 ORDER BY a.status <> 'offen', CASE WHEN a.status = 'offen' THEN a.eingegangen_am END,
          a.erledigt_am DESC
 LIMIT 300`;

const SQL_FINDE = `
SELECT a.id, a.eingegangen_am::text AS "eingegangenAm", a.name, a.email, a.ort, a.info,
       a.status, a.erledigt_am::text AS "erledigtAm", m.name AS "erledigtVon"
  FROM mitmach_anfrage a LEFT JOIN admin m ON m.id = a.erledigt_von
 WHERE a.id = $1::uuid`;

/** Mitmach-Anfragen (Issue #279) */
export class PgAnfragen implements AnfragenRepository {
  constructor(private readonly db: pg.Pool) {}
  async lege(a: NeueAnfrage, maxOffen: number) {
    const r = await this.db.query(
      `INSERT INTO mitmach_anfrage(name, email, ort, info)
       SELECT $1, $2, $3, $4
        WHERE (SELECT count(*) FROM mitmach_anfrage WHERE status = 'offen') < $5`,
      [a.name, a.email, a.ort, a.info, maxOffen],
    );
    return r.rowCount === 1;
  }
  async liste(): Promise<Anfrage[]> {
    const r = await this.db.query<Anfrage>(SQL_LISTE);
    return r.rows;
  }
  async finde(id: string): Promise<Anfrage | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await this.db.query<Anfrage>(SQL_FINDE, [id]);
    return r.rows[0] ?? null;
  }
  async erledige(id: string, status: 'angenommen' | 'abgelehnt', adminId: string) {
    // datenaenderung-freigegeben: #279 – nur die Anfrage selbst; die E-Mail wird dabei gelöscht.
    const r = await this.db.query(
      `UPDATE mitmach_anfrage SET status = $2, erledigt_am = now(), erledigt_von = $3, email = NULL
        WHERE id = $1::uuid AND status = 'offen'`,
      [id, status, adminId],
    );
    return r.rowCount === 1;
  }
  async raeumeAuf(erledigtTage: number, offenTage: number) {
    // datenaenderung-freigegeben: #279 – nur Mitmach-Anfragen, niemals Konten oder Termine.
    await this.db.query(
      `DELETE FROM mitmach_anfrage WHERE
        (status <> 'offen' AND erledigt_am < now() - make_interval(days => $1)) OR
        (status = 'offen' AND eingegangen_am < now() - make_interval(days => $2))`,
      [erledigtTage, offenTage],
    );
  }
}
