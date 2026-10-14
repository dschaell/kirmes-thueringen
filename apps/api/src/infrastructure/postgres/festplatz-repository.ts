import type {
  Bearbeitungslinks,
  Berechtigung,
  Festplatz,
  FestplatzRepository,
  FestplatzUebersicht,
  LandkreisKuerzel,
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
SELECT id, slug, name, landkreis, ST_Y(lage::geometry) AS lat, ST_X(lage::geometry) AS lon
  FROM ort WHERE slug = $1`;
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
INSERT INTO aenderungsprotokoll (link_id, ort_id, aktion, details) VALUES ($1, $2, $3, $4)`;

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
      }>(this.db, SQL_ORT, [ortSlug])
    ).rows[0];
    if (!ort) return null;
    const [plaetze, orte] = await Promise.all([
      abfrage<{ name: string; lat: number; lon: number }>(this.db, SQL_FESTPLAETZE, [ort.id]),
      abfrage<{ name: string }>(this.db, SQL_VERANSTALTUNGSORTE, [ort.id]),
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
      await c.query(SQL_PROTOKOLL, [durch.linkId, ortId, 'festplatz_gespeichert', f]);
    });
  }

  async loesche(ortSlug: string, name: string, durch: Berechtigung): Promise<boolean> {
    return this.inTransaktion(async (c) => {
      const r = await c.query<{ ort_id: string }>(SQL_LOESCHEN, [ortSlug, name]);
      const ortId = r.rows[0]?.ort_id;
      if (!ortId) return false;
      await c.query(SQL_PROTOKOLL, [durch.linkId, ortId, 'festplatz_geloescht', { name }]);
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
