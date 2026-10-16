import type {
  ErsterAdmin,
  AdminKonten,
  AdminKonto,
  LandkreisKuerzel,
  LinkInfo,
  LinkVerwaltung,
  Mitteilung,
  MitteilungRepository,
  NeueMitteilung,
  NeuerOrt,
  Ort,
  OrtVerwaltung,
  Sitzungen,
} from '@kirmes/core';
import type pg from 'pg';
import { hashToken } from './festplatz-repository.js';
import { abfrage } from './pool.js';

export class PgAdminKonten implements AdminKonten {
  constructor(private readonly db: pg.Pool) {}

  async findeNachEmail(email: string): Promise<AdminKonto | null> {
    const { rows } = await abfrage<{
      id: string;
      email: string;
      passwort_hash: string;
      totp_geheimnis: string;
    }>(
      this.db,
      'SELECT id::text, email, passwort_hash, totp_geheimnis FROM admin WHERE email = $1',
      [email],
    );
    const r = rows[0];
    return r
      ? { id: r.id, email: r.email, passwortHash: r.passwort_hash, totpGeheimnis: r.totp_geheimnis }
      : null;
  }

  async merkeLogin(id: string): Promise<void> {
    await abfrage(this.db, 'UPDATE admin SET letzter_login = now() WHERE id = $1', [id]);
  }
}

export class PgSitzungen implements Sitzungen {
  constructor(private readonly db: pg.Pool) {}

  async lege(adminId: string, token: string, stunden: number): Promise<void> {
    await abfrage(this.db, 'DELETE FROM admin_sitzung WHERE laeuft_ab < now()', []);
    await abfrage(
      this.db,
      `INSERT INTO admin_sitzung (token_hash, admin_id, laeuft_ab) VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [hashToken(token), adminId, stunden],
    );
  }

  async pruefe(token: string): Promise<{ adminId: string; email: string } | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { rows } = await abfrage<{ id: string; email: string }>(
      this.db,
      `SELECT a.id::text, a.email FROM admin_sitzung s JOIN admin a ON a.id = s.admin_id
        WHERE s.token_hash = $1 AND s.laeuft_ab > now()`,
      [hashToken(token)],
    );
    const r = rows[0];
    return r ? { adminId: r.id, email: r.email } : null;
  }

  async beende(token: string): Promise<void> {
    await abfrage(this.db, 'DELETE FROM admin_sitzung WHERE token_hash = $1', [hashToken(token)]);
  }
}

interface MitteilungZeile {
  id: string;
  titel: string;
  text: string;
  link: string | null;
  veroeffentlicht_am: string | null;
  erstellt_am: string;
}
const zuMitteilung = (z: MitteilungZeile): Mitteilung => ({
  id: z.id,
  titel: z.titel,
  text: z.text,
  link: z.link,
  veroeffentlichtAm: z.veroeffentlicht_am,
  erstelltAm: z.erstellt_am,
});
/* Achtung: Die formatierten Spalten heißen wie die Tabellenspalten – ORDER BY daher immer mit
   Tabellennamen (mitteilung.erstellt_am), sonst wird nach dem minutengenauen Text sortiert. */
const MITTEILUNG_SPALTEN = `id::text, titel, text, link,
  to_char(veroeffentlicht_am AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') AS veroeffentlicht_am,
  to_char(erstellt_am AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') AS erstellt_am`;

export class PgMitteilungen implements MitteilungRepository {
  constructor(private readonly db: pg.Pool) {}

  async liste(): Promise<Mitteilung[]> {
    const { rows } = await abfrage<MitteilungZeile>(
      this.db,
      `SELECT ${MITTEILUNG_SPALTEN} FROM mitteilung ORDER BY mitteilung.erstellt_am DESC, mitteilung.id DESC LIMIT 100`,
      [],
    );
    return rows.map(zuMitteilung);
  }

  async aktuelle(): Promise<Mitteilung | null> {
    const { rows } = await abfrage<MitteilungZeile>(
      this.db,
      `SELECT ${MITTEILUNG_SPALTEN} FROM mitteilung
        WHERE veroeffentlicht_am IS NOT NULL
        ORDER BY mitteilung.veroeffentlicht_am DESC, mitteilung.id DESC LIMIT 1`,
      [],
    );
    return rows[0] ? zuMitteilung(rows[0]) : null;
  }

  async lege(m: NeueMitteilung, adminId: string): Promise<Mitteilung> {
    const { rows } = await abfrage<MitteilungZeile>(
      this.db,
      `INSERT INTO mitteilung (titel, text, link, erstellt_von) VALUES ($1, $2, $3, $4)
       RETURNING ${MITTEILUNG_SPALTEN}`,
      [m.titel, m.text, m.link, adminId],
    );
    const neu = rows[0];
    if (!neu) throw new Error('Mitteilung nicht gespeichert');
    return zuMitteilung(neu);
  }

  async setzeVeroeffentlicht(id: string, an: boolean): Promise<boolean> {
    const r = await abfrage(
      this.db,
      `UPDATE mitteilung SET veroeffentlicht_am = CASE WHEN $2 THEN now() ELSE NULL END
        WHERE id = $1::bigint`,
      [id, an],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async loesche(id: string): Promise<boolean> {
    const r = await abfrage(this.db, 'DELETE FROM mitteilung WHERE id = $1::bigint', [id]);
    return (r.rowCount ?? 0) > 0;
  }
}

export class PgOrtVerwaltung implements OrtVerwaltung {
  constructor(private readonly db: pg.Pool) {}

  async lege(o: NeuerOrt, adminId: string): Promise<Ort | null> {
    const { rows } = await abfrage<{ id: string }>(
      this.db,
      `INSERT INTO ort (slug, name, landkreis, lage, herkunft)
       VALUES ($1, $2, $3,
               CASE WHEN $4::float8 IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography END,
               'redaktion')
       ON CONFLICT (slug) DO NOTHING RETURNING id::text`,
      [o.slug, o.name, o.landkreis, o.koordinate?.lat ?? null, o.koordinate?.lon ?? null],
    );
    const neu = rows[0];
    if (!neu) return null;
    await abfrage(
      this.db,
      `INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details) VALUES ($1, $2, 'ort_angelegt', $3)`,
      [adminId, neu.id, o],
    );
    return { slug: o.slug, name: o.name, landkreis: o.landkreis, koordinate: o.koordinate };
  }
}

/** Landkreis eines Ortes (für die Berechtigung der Redaktion); null = Ort unbekannt. */
export const ortLandkreis = (db: pg.Pool) => async (slug: string) => {
  const { rows } = await abfrage<{ landkreis: LandkreisKuerzel }>(
    db,
    'SELECT landkreis FROM ort WHERE slug = $1',
    [slug],
  );
  return rows[0]?.landkreis ?? null;
};

interface LinkZeile {
  id: string;
  slug: string;
  ort: string;
  bezeichnung: string;
  erstellt: string;
  genutzt: string | null;
  gesperrt: string | null;
}
const zuLink = (z: LinkZeile): LinkInfo => ({
  id: z.id,
  ortSlug: z.slug,
  ortName: z.ort,
  bezeichnung: z.bezeichnung,
  erstelltAm: z.erstellt,
  zuletztGenutzt: z.genutzt,
  gesperrtAm: z.gesperrt,
});
const LINK_SPALTEN = `l.id::text, o.slug, o.name AS ort, l.bezeichnung,
  to_char(l.erstellt_am AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS erstellt,
  to_char(l.zuletzt_genutzt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') AS genutzt,
  to_char(l.gesperrt_am AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS gesperrt`;

export class PgLinkVerwaltung implements LinkVerwaltung {
  constructor(private readonly db: pg.Pool) {}

  async erstelle(ortSlug: string, bezeichnung: string, token: string): Promise<LinkInfo | null> {
    const { rows } = await abfrage<LinkZeile>(
      this.db,
      `WITH neu AS (
         INSERT INTO bearbeitungslink (ort_id, token_hash, bezeichnung)
         SELECT id, $2, $3 FROM ort WHERE slug = $1 RETURNING *
       )
       SELECT ${LINK_SPALTEN} FROM neu l JOIN ort o ON o.id = l.ort_id`,
      [ortSlug, hashToken(token), bezeichnung],
    );
    return rows[0] ? zuLink(rows[0]) : null;
  }

  async liste(): Promise<LinkInfo[]> {
    const { rows } = await abfrage<LinkZeile>(
      this.db,
      `SELECT ${LINK_SPALTEN} FROM bearbeitungslink l JOIN ort o ON o.id = l.ort_id
        ORDER BY l.gesperrt_am IS NOT NULL, o.name, l.id`,
      [],
    );
    return rows.map(zuLink);
  }

  async sperre(id: string): Promise<boolean> {
    const r = await abfrage(
      this.db,
      'UPDATE bearbeitungslink SET gesperrt_am = now() WHERE id = $1::bigint AND gesperrt_am IS NULL',
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  }
}

/**
 * Erster Redaktionszugang (Issue #48). Eine Transaktions-Sperre (Advisory Lock) sorgt dafür, dass
 * auch zwei gleichzeitige Einrichtungen nur EIN Konto anlegen.
 */
export class PgErsterAdmin implements ErsterAdmin {
  constructor(private readonly db: pg.Pool) {}

  async gibtEs(): Promise<boolean> {
    const { rows } = await abfrage<{ ja: boolean }>(
      this.db,
      'SELECT EXISTS (SELECT 1 FROM admin) AS ja',
      [],
    );
    return rows[0]?.ja === true;
  }

  async legeAn(email: string, passwortHash: string, totpGeheimnis: string): Promise<string | null> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('kirmes_erster_admin'))");
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO admin (email, passwort_hash, totp_geheimnis)
         SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM admin)
         RETURNING id::text`,
        [email, passwortHash, totpGeheimnis],
      );
      await c.query('COMMIT');
      return rows[0]?.id ?? null;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
