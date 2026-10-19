import type {
  NeuerVorschlag,
  Vorschlag,
  VorschlagsRepository,
  VorschlagsTermin,
} from '@kirmes/core';
import type pg from 'pg';

const BASIS = `SELECT v.id, o.slug AS "ortSlug", o.name AS "ortName", v.erstellt_am::text AS "erstelltAm",
 v.kontakt_name AS "kontaktName", v.kontakt_email AS "kontaktEmail", v.nachricht,
 coalesce((SELECT jsonb_agg(jsonb_build_object('ortSlug', o.slug, 'landkreis', o.landkreis,
 'datum', t.datum::text, 'beginn', to_char(t.beginn, 'HH24:MI'), 'titel', t.titel,
 'veranstaltungsort', t.veranstaltungsort, 'kategorie', t.kategorie, 'band', t.band,
 'info', t.info, 'pfarrer', t.pfarrer, 'muttizettel', t.muttizettel, 'bestaetigt', false, 'speisen', t.speisen,
 'platz', CASE WHEN t.platz_lat IS NULL THEN NULL
   ELSE jsonb_build_object('lat', t.platz_lat, 'lon', t.platz_lon) END)
 ORDER BY t.position) FROM vorschlag_termin t WHERE t.vorschlag_id = v.id), '[]') AS termine
 FROM vorschlag v JOIN ort o ON o.id = v.ort_id`;
const LISTE = BASIS + ` WHERE v.status = 'offen' ORDER BY v.erstellt_am LIMIT 100`;
const FINDE = BASIS + ` WHERE v.id = $1::uuid AND v.status = 'offen'`;
const ABSCHLUSS = `UPDATE vorschlag SET status = $2, bearbeitet_von = $3, bearbeitet_am = now(),
 kontakt_name = NULL, kontakt_email = NULL, nachricht = NULL, grund = $4 WHERE id = $1::uuid`;
const AUDIT = `INSERT INTO aenderungsprotokoll(admin_id, ort_id, aktion, details) VALUES ($1, $2, $3, $4)`;
const ANLEGEN = `INSERT INTO termin(ort_id, datum, beginn, titel, veranstaltungsort, kategorie,
 bestaetigt, quelle, eingetragen_von_admin, band, info, muttizettel, pfarrer)
 SELECT id, $2::date, $3::time, $4, $5, $6, $7, 'Redaktion', $8, $9, $10, $11, $12 FROM ort WHERE slug = $1
 ON CONFLICT (ort_id, datum, titel) DO NOTHING RETURNING id, ort_id`;

const PLATZ = `INSERT INTO festplatz(ort_id, name, lage)
 VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
 ON CONFLICT (ort_id, name) DO UPDATE SET lage = EXCLUDED.lage, geaendert_am = now()`;

class TerminKonflikt extends Error {}

export class PgVorschlaege implements VorschlagsRepository {
  constructor(private readonly db: pg.Pool) {}
  private async transaktion<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async lege(v: NeuerVorschlag): Promise<string | false> {
    return this.transaktion(async (c) => {
      const ort = await c.query<{ id: string }>('SELECT id FROM ort WHERE slug = $1 FOR UPDATE', [
        v.ortSlug,
      ]);
      const id = ort.rows[0]?.id;
      if (!id) return false;
      const n = await c.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM vorschlag WHERE ort_id = $1 AND status = 'offen'",
        [id],
      );
      if ((n.rows[0]?.n ?? 50) >= 50) return false;
      const r = await c.query<{ id: string }>(
        `INSERT INTO vorschlag(ort_id, kontakt_name, kontakt_email, nachricht)
        VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, v.kontaktName, v.kontaktEmail, v.nachricht],
      );
      const vid = r.rows[0]?.id;
      if (!vid) throw new Error('Vorschlag konnte nicht angelegt werden');
      for (const [i, t] of v.termine.entries()) {
        await c.query(
          `INSERT INTO vorschlag_termin(vorschlag_id, position, datum, beginn, titel,
          veranstaltungsort, kategorie, band, info, muttizettel, speisen, platz_lat, platz_lon, pfarrer)
          VALUES ($1, $2, $3::date, $4::time, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)`,
          [
            vid,
            i + 1,
            t.datum,
            t.beginn,
            t.titel,
            t.veranstaltungsort,
            t.kategorie,
            t.band,
            t.info,
            t.muttizettel,
            JSON.stringify(t.speisen),
            t.platz?.lat ?? null,
            t.platz?.lon ?? null,
            t.pfarrer,
          ],
        );
      }
      return vid;
    });
  }
  async liste(): Promise<Vorschlag[]> {
    return (await this.db.query<Vorschlag>(LISTE)).rows;
  }
  async finde(id: string): Promise<Vorschlag | null> {
    return (await this.db.query<Vorschlag>(FINDE, [id])).rows[0] ?? null;
  }
  async anzahl() {
    return (
      (
        await this.db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM vorschlag WHERE status = 'offen'",
        )
      ).rows[0]?.n ?? 0
    );
  }
  async uebernehme(
    id: string,
    termine: VorschlagsTermin[],
    adminId: string,
  ): Promise<boolean | 'KONFLIKT'> {
    try {
      return await this.transaktion(async (c) => {
        const r = await c.query<{ ort_id: string }>(
          "SELECT ort_id FROM vorschlag WHERE id = $1::uuid AND status = 'offen' FOR UPDATE",
          [id],
        );
        const ort = r.rows[0]?.ort_id;
        if (!ort) return false;
        for (const t of termine) {
          // Keine vorhandenen Termine überschreiben: ein Konflikt rollt den gesamten Vorschlag zurück.
          const neu = await c.query<{ id: string; ort_id: string }>(ANLEGEN, [
            t.ortSlug,
            t.datum,
            t.beginn,
            t.titel,
            t.veranstaltungsort,
            t.kategorie,
            t.bestaetigt,
            adminId,
            t.band,
            t.info,
            t.muttizettel,
            t.pfarrer,
          ]);
          const termin = neu.rows[0];
          if (!termin) throw new TerminKonflikt();
          for (const [i, s] of t.speisen.entries()) {
            await c.query(
              'INSERT INTO termin_speise(termin_id, position, name, preis_cent) VALUES ($1::uuid, $2, $3, $4)',
              [termin.id, i + 1, s.name, s.preisCent],
            );
          }
          await c.query(AUDIT, [
            adminId,
            termin.ort_id,
            'termin_angelegt',
            { id: termin.id, vorschlag: id },
          ]);
          // Kartenpunkt des Einsenders nur mit Haken der Redaktion als Platz übernehmen (Issue #169)
          if (t.platz && t.platzUebernehmen && t.veranstaltungsort) {
            await c.query(PLATZ, [termin.ort_id, t.veranstaltungsort, t.platz.lon, t.platz.lat]);
            await c.query(AUDIT, [
              adminId,
              termin.ort_id,
              'festplatz_gespeichert',
              { name: t.veranstaltungsort, ...t.platz, vorschlag: id },
            ]);
          }
        }
        // datenaenderung-freigegeben: #71 – Kontaktdaten sofort nach Bearbeitung entfernen.
        await c.query(ABSCHLUSS, [id, 'uebernommen', adminId, null]);
        await c.query(AUDIT, [
          adminId,
          ort,
          'vorschlag_uebernommen',
          { id, anzahl: termine.length },
        ]);
        return true;
      });
    } catch (e) {
      if (e instanceof TerminKonflikt) return 'KONFLIKT';
      throw e;
    }
  }
  async lehneAb(id: string, grund: string | null, adminId: string) {
    return this.transaktion(async (c) => {
      const r = await c.query<{ ort_id: string }>(
        "SELECT ort_id FROM vorschlag WHERE id = $1::uuid AND status = 'offen' FOR UPDATE",
        [id],
      );
      const ort = r.rows[0]?.ort_id;
      if (!ort) return false;
      // datenaenderung-freigegeben: #71 – auch Nachricht kann Kontaktdaten enthalten.
      await c.query(ABSCHLUSS, [id, 'abgelehnt', adminId, grund]);
      await c.query(AUDIT, [adminId, ort, 'vorschlag_abgelehnt', { id }]);
      return true;
    });
  }
  async raeumeAuf() {
    // datenaenderung-freigegeben: #71 – nur neue Vorschlagsdaten, niemals veröffentlichte Termine.
    await this.db.query(`DELETE FROM vorschlag WHERE
      (status = 'offen' AND erstellt_am < now() - interval '180 days') OR
      (status <> 'offen' AND bearbeitet_am < now() - interval '30 days')`);
  }
}
