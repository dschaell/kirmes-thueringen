import type { PushAblage, PushAbo, PushTermin, PushZiel } from '@kirmes/core';
import type pg from 'pg';

/** Push-Abos (Issue #348): je Gerät Endpunkt + Schlüssel, gefolgte Orte, gemerkte Termine. */
const SQL_ABO = `
INSERT INTO push_abo (endpoint, p256dh, auth, erinnerung) VALUES ($1, $2, $3, $4)
ON CONFLICT (endpoint) DO UPDATE
   SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, erinnerung = EXCLUDED.erinnerung,
       gesehen_am = now()
RETURNING id`;
// datenaenderung-freigegeben: #348 – Listen eines Geräts werden bei jedem Abgleich ersetzt
const SQL_ORTE_LEEREN = `DELETE FROM push_ort WHERE abo_id = $1`;
const SQL_TERMINE_LEEREN = `DELETE FROM push_termin WHERE abo_id = $1`;
/** Unbekannte Orte und Termine fallen still weg */
const SQL_ORTE = `
INSERT INTO push_ort (abo_id, ort_id) SELECT $1, o.id FROM ort o WHERE o.slug = ANY($2::text[])`;
const SQL_TERMINE = `
INSERT INTO push_termin (abo_id, termin_id) SELECT $1, t.id FROM termin t WHERE t.id = ANY($2::uuid[])`;
// datenaenderung-freigegeben: #348 – Abmelden löscht das Gerät samt Listen
const SQL_LOESCHEN = `DELETE FROM push_abo WHERE endpoint = $1`;
const SQL_EMPFAENGER = `
SELECT a.endpoint, a.p256dh, a.auth FROM push_abo a
 WHERE EXISTS (SELECT 1 FROM push_ort po JOIN ort o ON o.id = po.ort_id
                WHERE po.abo_id = a.id AND o.slug = $1)
    OR EXISTS (SELECT 1 FROM push_termin pt WHERE pt.abo_id = a.id AND pt.termin_id = ANY($2::uuid[]))`;
/** Geräte mit Terminen am Tag, die noch nicht erinnert wurden – und gleich als erinnert markieren */
const SQL_ERINNERUNGEN = `
WITH ziel AS (
  SELECT a.id, a.endpoint, a.p256dh, a.auth,
         jsonb_agg(DISTINCT jsonb_build_object(
           'id', t.id, 'titel', t.titel, 'datum', t.datum::text, 'beginn', to_char(t.beginn, 'HH24:MI'),
           'ortSlug', o.slug, 'ortName', o.name, 'veranstaltungsort', t.veranstaltungsort)) AS termine
    FROM push_abo a
    JOIN termin t ON t.datum = $1::date
     AND (EXISTS (SELECT 1 FROM push_termin pt WHERE pt.abo_id = a.id AND pt.termin_id = t.id)
       OR EXISTS (SELECT 1 FROM push_ort po WHERE po.abo_id = a.id AND po.ort_id = t.ort_id))
    JOIN ort o ON o.id = t.ort_id
   WHERE a.erinnerung AND (a.erinnert_fuer IS NULL OR a.erinnert_fuer < $1::date)
   GROUP BY a.id),
markiert AS (UPDATE push_abo SET erinnert_fuer = $1::date WHERE id IN (SELECT id FROM ziel))
SELECT endpoint, p256dh, auth, termine FROM ziel`;
// datenaenderung-freigegeben: #348 – Geräte, die sich lange nicht gemeldet haben
const SQL_AUFRAEUMEN = `DELETE FROM push_abo WHERE gesehen_am < now() - make_interval(days => $1::int)`;

const nachBeginn = (a: PushTermin, b: PushTermin) =>
  (a.beginn ?? '').localeCompare(b.beginn ?? '') || a.titel.localeCompare(b.titel, 'de');

export class PgPush implements PushAblage {
  constructor(private readonly db: pg.Pool) {}

  async speichere(abo: PushAbo): Promise<void> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query<{ id: string }>(SQL_ABO, [
        abo.endpoint,
        abo.p256dh,
        abo.auth,
        abo.erinnerung,
      ]);
      const id = r.rows[0]?.id;
      await c.query(SQL_ORTE_LEEREN, [id]);
      await c.query(SQL_TERMINE_LEEREN, [id]);
      await c.query(SQL_ORTE, [id, abo.orte]);
      await c.query(SQL_TERMINE, [id, abo.termine]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async loesche(endpoint: string): Promise<boolean> {
    return Number((await this.db.query(SQL_LOESCHEN, [endpoint])).rowCount) > 0;
  }

  async empfaenger(ortSlug: string, terminIds: readonly string[]): Promise<PushZiel[]> {
    return (await this.db.query<PushZiel>(SQL_EMPFAENGER, [ortSlug, terminIds])).rows;
  }

  async erinnerungen(datum: string) {
    const r = await this.db.query<PushZiel & { termine: PushTermin[] }>(SQL_ERINNERUNGEN, [datum]);
    return r.rows.map(({ termine, ...ziel }) => ({ ziel, termine: [...termine].sort(nachBeginn) }));
  }

  async raeumeAuf(tage: number): Promise<void> {
    await this.db.query(SQL_AUFRAEUMEN, [tage]);
  }
}
