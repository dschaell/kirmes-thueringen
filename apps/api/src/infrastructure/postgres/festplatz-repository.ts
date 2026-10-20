import type {
  Bearbeitungslinks,
  Berechtigung,
  Festplatz,
  FestplatzRepository,
  FestplatzUebersicht,
  Koordinate,
  LandkreisKuerzel,
  Umbenennung,
} from '@kirmes/core';
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { abfrage } from './pool.js';

/** 32 zufällige Bytes, Base64url → 43 Zeichen. Nur der SHA-256-Hash wird gespeichert. */
export const erzeugeToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const SQL_LINK_PRUEFEN = `
UPDATE bearbeitungslink l SET zuletzt_genutzt = now()
  FROM ort o
 WHERE l.token_hash = $1 AND l.gesperrt_am IS NULL AND o.id = l.ort_id
RETURNING l.id::text AS id, o.slug, o.landkreis, l.bezeichnung`;

export class PgBearbeitungslinks implements Bearbeitungslinks {
  constructor(private readonly db: pg.Pool) {}

  async pruefe(token: string): Promise<Berechtigung | null> {
    if (!TOKEN_FORMAT.test(token)) return null; // spart den DB-Zugriff bei Unsinn
    const { rows } = await abfrage<{
      id: string;
      slug: string;
      landkreis: string;
      bezeichnung: string;
    }>(this.db, SQL_LINK_PRUEFEN, [hashToken(token)]);
    const r = rows[0];
    return r
      ? { linkId: r.id, ortSlug: r.slug, landkreis: r.landkreis, bezeichnung: r.bezeichnung }
      : null;
  }
}

const SQL_ORT = `
SELECT id, slug, name, landkreis, ST_Y(lage::geometry) AS lat, ST_X(lage::geometry) AS lon,
       herkunft = 'redaktion' AS eigen
  FROM ort WHERE slug = $1`;
// Alle Plätze (Issue #216): Festplätze ∪ „Wo genau?“ der Termine, mit Terminanzahl und Kartenpunkt.
// Der Hauptfestplatz ('') zählt die Termine ohne „Wo genau?“.
const SQL_PLAETZE = `
SELECT n.name, coalesce(t.anzahl, 0)::int AS termine,
       ST_Y(f.lage::geometry) AS lat, ST_X(f.lage::geometry) AS lon
  FROM (SELECT name FROM festplatz WHERE ort_id = $1
        UNION
        SELECT veranstaltungsort FROM termin WHERE ort_id = $1 AND veranstaltungsort <> '') n
  LEFT JOIN festplatz f ON f.ort_id = $1 AND f.name = n.name
  LEFT JOIN (SELECT coalesce(veranstaltungsort, '') AS name, count(*) AS anzahl
               FROM termin WHERE ort_id = $1 GROUP BY 1) t ON t.name = n.name
 ORDER BY n.name`;
const SQL_FESTPLAETZE = `
SELECT name, ST_Y(lage::geometry) AS lat, ST_X(lage::geometry) AS lon
  FROM festplatz WHERE ort_id = $1 ORDER BY name`;
const SQL_VERANSTALTUNGSORTE = `
SELECT DISTINCT veranstaltungsort AS name FROM termin
 WHERE ort_id = $1 AND veranstaltungsort IS NOT NULL ORDER BY 1`;
const SQL_SPEICHERN = `
INSERT INTO festplatz (ort_id, name, lage)
SELECT id, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography FROM ort WHERE slug = $1
ON CONFLICT (ort_id, name) DO UPDATE SET lage = EXCLUDED.lage, geaendert_am = now()
RETURNING ort_id`;
const SQL_LOESCHEN = `
DELETE FROM festplatz f USING ort o
 WHERE o.slug = $1 AND f.ort_id = o.id AND f.name = $2
RETURNING f.ort_id`;
const SQL_PROTOKOLL = `
INSERT INTO aenderungsprotokoll (link_id, ort_id, aktion, details, admin_id)
VALUES ($1, $2, $3, $4, $5::bigint)`;

export class PgFestplatzRepository implements FestplatzRepository {
  constructor(private readonly db: pg.Pool) {}

  async uebersicht(ortSlug: string): Promise<FestplatzUebersicht | null> {
    const ort = (
      await abfrage<{
        id: string;
        slug: string;
        name: string;
        landkreis: LandkreisKuerzel;
        lat: number | null;
        lon: number | null;
        eigen: boolean;
      }>(this.db, SQL_ORT, [ortSlug])
    ).rows[0];
    if (!ort) return null;
    const [plaetze, orte, alle] = await Promise.all([
      abfrage<{ name: string; lat: number; lon: number }>(this.db, SQL_FESTPLAETZE, [ort.id]),
      abfrage<{ name: string }>(this.db, SQL_VERANSTALTUNGSORTE, [ort.id]),
      abfrage<{ name: string; termine: number; lat: number | null; lon: number | null }>(
        this.db,
        SQL_PLAETZE,
        [ort.id],
      ),
    ]);
    return {
      ort: {
        slug: ort.slug,
        name: ort.name,
        landkreis: ort.landkreis,
        koordinate: ort.lat != null && ort.lon != null ? { lat: ort.lat, lon: ort.lon } : null,
      },
      festplaetze: plaetze.rows.map((p) => ({
        name: p.name,
        koordinate: { lat: p.lat, lon: p.lon },
      })),
      veranstaltungsorte: orte.rows.map((o) => o.name),
      plaetze: alle.rows.map((p) => ({
        name: p.name,
        termine: p.termine,
        koordinate: p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : null,
      })),
      eigenerOrt: ort.eigen,
    };
  }

  /** Speichern und Protokolleintrag in einer Transaktion. */
  async speichere(ortSlug: string, f: Festplatz, durch: Berechtigung): Promise<void> {
    await this.inTransaktion(async (c) => {
      const r = await c.query<{ ort_id: string }>(SQL_SPEICHERN, [
        ortSlug,
        f.name,
        f.koordinate.lat,
        f.koordinate.lon,
      ]);
      const ortId = r.rows[0]?.ort_id;
      if (!ortId) throw new Error(`Ort ${ortSlug} nicht gefunden`);
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        ortId,
        'festplatz_gespeichert',
        f,
        durch.adminId ?? null,
      ]);
    });
  }

  async loesche(ortSlug: string, name: string, durch: Berechtigung): Promise<boolean> {
    return this.inTransaktion(async (c) => {
      const r = await c.query<{ ort_id: string }>(SQL_LOESCHEN, [ortSlug, name]);
      const ortId = r.rows[0]?.ort_id;
      if (!ortId) return false;
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        ortId,
        'festplatz_geloescht',
        { name },
        durch.adminId ?? null,
      ]);
      return true;
    });
  }

  /**
   * Termine und Festplatz gemeinsam umbenennen (Issue #216). Der Ort wird gesperrt, damit nicht
   * gleichzeitig jemand denselben Platz anlegt. Termine bekommen eine neue Version (Kalender-Abos).
   */
  async benenneUm(
    ortSlug: string,
    alt: string,
    neu: string,
    durch: Berechtigung,
  ): Promise<Umbenennung> {
    return this.inTransaktion(async (c) => {
      const { rows } = await c.query<{ id: string; alt_platz: boolean; neu_platz: boolean }>(
        `SELECT o.id::text,
                EXISTS (SELECT 1 FROM festplatz f WHERE f.ort_id = o.id AND f.name = $2) AS alt_platz,
                EXISTS (SELECT 1 FROM festplatz f WHERE f.ort_id = o.id AND f.name = $3) AS neu_platz
           FROM ort o WHERE o.slug = $1 FOR UPDATE`,
        [ortSlug, alt, neu],
      );
      const o = rows[0];
      if (!o) return 'unbekannt';
      if (o.alt_platz && o.neu_platz) return 'konflikt';
      const t = await c.query(
        `UPDATE termin SET veranstaltungsort = $3, version = version + 1, geaendert_am = now()
          WHERE ort_id = $1::bigint AND veranstaltungsort = $2`,
        [o.id, alt, neu],
      );
      if (!o.alt_platz && !t.rowCount) return 'unbekannt';
      if (o.alt_platz)
        await c.query(
          `UPDATE festplatz SET name = $3, geaendert_am = now() WHERE ort_id = $1::bigint AND name = $2`,
          [o.id, alt, neu],
        );
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        o.id,
        'platz_umbenannt',
        { alt, neu, termine: t.rowCount },
        durch.adminId ?? null,
      ]);
      return 'umbenannt';
    });
  }

  async setzeOrtsmitte(ortSlug: string, k: Koordinate, durch: Berechtigung): Promise<boolean> {
    return this.inTransaktion(async (c) => {
      const r = await c.query<{ id: string }>(
        `UPDATE ort SET lage = ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
          WHERE slug = $1 RETURNING id::text`,
        [ortSlug, k.lat, k.lon],
      );
      const ortId = r.rows[0]?.id;
      if (!ortId) return false;
      await c.query(SQL_PROTOKOLL, [
        durch.linkId,
        ortId,
        'ortsmitte_gesetzt',
        k,
        durch.adminId ?? null,
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
