/** Konten der Redaktion: Sitzungen, Mitglieder, Einladungen, Kontoanlage (Issue #199: aus admin-repository.ts ausgelagert). */
import { LetzterAdmin } from '@kirmes/core';
import type {
  AdminKonten,
  Anlagebedingung,
  EinladungInfo,
  Einladungen,
  ErsterAdmin,
  KontoAnlage,
  Mitglied,
  MitgliederRepository,
  NeuesKonto,
  RegistrierterSchluessel,
  Rolle,
  Sitzung,
  Sitzungen,
} from '@kirmes/core';
import type pg from 'pg';
import { hashToken } from './festplatz-repository.js';
import { abfrage } from './pool.js';

export class PgAdminKonten implements AdminKonten {
  constructor(private readonly db: pg.Pool) {}

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

  async pruefe(token: string): Promise<Sitzung | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { rows } = await abfrage<{
      id: string;
      name: string;
      rolle: Rolle;
      ort_slug: string | null;
      ort_name: string | null;
      kg_name: string | null;
    }>(
      this.db,
      `SELECT a.id::text, a.name, a.rolle, o.slug AS ort_slug, o.name AS ort_name, o.kg_name
         FROM admin_sitzung s JOIN admin a ON a.id = s.admin_id LEFT JOIN ort o ON o.id = a.ort_id
        WHERE s.token_hash = $1 AND s.laeuft_ab > now()`,
      [hashToken(token)],
    );
    const r = rows[0];
    return r
      ? {
          adminId: r.id,
          name: r.name,
          rolle: r.rolle,
          ortSlug: r.ort_slug,
          ortName: r.ort_name,
          kgName: r.kg_name,
        }
      : null;
  }

  async beende(token: string): Promise<void> {
    await abfrage(this.db, 'DELETE FROM admin_sitzung WHERE token_hash = $1', [hashToken(token)]);
  }
}

/** Gibt es schon einen Admin? Sonst ist die Ersteinrichtung offen (Issue #48). */
export class PgErsterAdmin implements ErsterAdmin {
  constructor(private readonly db: pg.Pool) {}

  async gibtEs(): Promise<boolean> {
    const { rows } = await abfrage<{ ja: boolean }>(
      this.db,
      "SELECT EXISTS (SELECT 1 FROM admin WHERE rolle = 'admin') AS ja",
      [],
    );
    return rows[0]?.ja === true;
  }
}

/** Mitglieder der Redaktion (Issue #56) – nur Name, Rolle, Zeitstempel, Anzahl Passkeys. */
export class PgMitglieder implements MitgliederRepository {
  constructor(private readonly db: pg.Pool) {}

  async liste(): Promise<Mitglied[]> {
    const { rows } = await abfrage<{
      id: string;
      name: string;
      rolle: Rolle;
      erstellt_am: string;
      letzter_login: string | null;
      passkeys: number;
      ort_name: string | null;
      ort_slug: string | null;
      kg_name: string | null;
    }>(
      this.db,
      `SELECT a.id::text, a.name, a.rolle, a.erstellt_am::text, a.letzter_login::text,
              (SELECT count(*)::int FROM admin_passkey p WHERE p.admin_id = a.id) AS passkeys,
              o.name AS ort_name, o.slug AS ort_slug, o.kg_name
         FROM admin a LEFT JOIN ort o ON o.id = a.ort_id ORDER BY a.rolle, lower(a.name), a.id`,
      [],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      rolle: r.rolle,
      erstelltAm: r.erstellt_am,
      letzterLogin: r.letzter_login,
      passkeys: r.passkeys,
      ortName: r.ort_name,
      ortSlug: r.ort_slug,
      kgName: r.kg_name,
    }));
  }

  setzeRolle(id: string, rolle: Rolle): Promise<boolean> {
    return this.aendereGeschuetzt(id, rolle);
  }

  /** Name der Kirmesgesellschaft eines Ortes (Issue #246) */
  async setzeKgName(ortSlug: string, name: string | null): Promise<boolean> {
    const r = await abfrage(this.db, 'UPDATE ort SET kg_name = $2 WHERE slug = $1', [
      ortSlug,
      name,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Anzeigenamen ändern (Issue #244) */
  async setzeName(id: string, name: string): Promise<boolean> {
    if (!/^\d{1,18}$/.test(id)) return false;
    const r = await abfrage(this.db, 'UPDATE admin SET name = $2 WHERE id = $1::bigint', [
      id,
      name,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  entferne(id: string): Promise<boolean> {
    return this.aendereGeschuetzt(id, null);
  }

  private async aendereGeschuetzt(id: string, rolle: Rolle | null): Promise<boolean> {
    if (!/^\d{1,18}$/.test(id)) return false;
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      // Gleiche Sperre für Herabstufungen UND Löschungen, auch über mehrere API-Prozesse.
      await c.query('SELECT pg_advisory_xact_lock(20261017, 85)');
      const ziel = await c.query<{ rolle: Rolle }>(
        'SELECT rolle FROM admin WHERE id = $1::bigint',
        [id],
      );
      if (ziel.rows[0]?.rolle === 'admin' && rolle !== 'admin') {
        const n = await c.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM admin WHERE rolle = 'admin'",
        );
        if ((n.rows[0]?.n ?? 0) <= 1) throw new LetzterAdmin();
      }
      const r =
        rolle === null
          ? await c.query('DELETE FROM admin WHERE id = $1::bigint', [id])
          : await c.query(
              `UPDATE admin SET rolle = $2::text,
                      ort_id = CASE WHEN $2::text = 'kirmesgesellschaft' THEN ort_id END
                WHERE id = $1::bigint`,
              [id, rolle],
            );
      await c.query('COMMIT');
      return (r.rowCount ?? 0) > 0;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async anzahlAdmins(): Promise<number> {
    const { rows } = await abfrage<{ n: number }>(
      this.db,
      "SELECT count(*)::int AS n FROM admin WHERE rolle = 'admin'",
      [],
    );
    return rows[0]?.n ?? 0;
  }
}

const zuEinladung = (r: {
  id: string;
  rolle: Rolle;
  erstellt_am: string;
  laeuft_ab: string;
  bezeichnung?: string;
  ort_name?: string | null;
  ort_slug?: string | null;
  erstellt_von?: string | null;
}) => ({
  id: r.id,
  rolle: r.rolle,
  erstelltAm: r.erstellt_am,
  laeuftAb: r.laeuft_ab,
  ...(r.bezeichnung ? { bezeichnung: r.bezeichnung } : {}),
  ...(r.ort_name ? { ortName: r.ort_name } : {}),
  ...(r.ort_slug ? { ortSlug: r.ort_slug } : {}),
  ...(r.erstellt_von !== undefined ? { erstelltVon: r.erstellt_von } : {}),
});

/** Einladungen in die Redaktion – gespeichert wird nur der SHA-256 des Tokens. */
export class PgEinladungen implements Einladungen {
  constructor(private readonly db: pg.Pool) {}

  async lege(
    token: string,
    rolle: Rolle,
    vonId: string | null,
    tage: number,
    bezeichnung = '',
    ortSlug: string | null = null,
  ): Promise<EinladungInfo | null> {
    // Ort der Kirmesgesellschaft (Issue #180): unbekannter Ort → keine Einladung
    const { rows } = await abfrage<{
      id: string;
      rolle: Rolle;
      erstellt_am: string;
      laeuft_ab: string;
      bezeichnung: string;
      ort_name: string | null;
      ort_slug: string | null;
    }>(
      this.db,
      `WITH o AS (SELECT id, name, slug FROM ort WHERE slug = $6)
       INSERT INTO einladung (token_hash, rolle, erstellt_von, laeuft_ab, bezeichnung, ort_id)
       SELECT $1, $2, $3::bigint, now() + make_interval(days => $4), $5, (SELECT id FROM o)
        WHERE $6::text IS NULL OR EXISTS (SELECT 1 FROM o)
       RETURNING id::text, rolle, erstellt_am::text, laeuft_ab::text, bezeichnung,
                 (SELECT name FROM o) AS ort_name, (SELECT slug FROM o) AS ort_slug`,
      [hashToken(token), rolle, vonId, tage, bezeichnung, ortSlug],
    );
    const r = rows[0];
    return r ? zuEinladung(r) : null;
  }

  async finde(
    token: string,
  ): Promise<{ id: string; rolle: Rolle; ortName: string | null; kgName: string | null } | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { rows } = await abfrage<{
      id: string;
      rolle: Rolle;
      ort_name: string | null;
      kg_name: string | null;
    }>(
      this.db,
      `SELECT e.id::text, e.rolle, o.name AS ort_name, o.kg_name
         FROM einladung e LEFT JOIN ort o ON o.id = e.ort_id
        WHERE e.token_hash = $1 AND e.genutzt_am IS NULL AND e.laeuft_ab > now()`,
      [hashToken(token)],
    );
    const r = rows[0];
    return r ? { id: r.id, rolle: r.rolle, ortName: r.ort_name, kgName: r.kg_name } : null;
  }

  async offene(): Promise<EinladungInfo[]> {
    const { rows } = await abfrage<{
      id: string;
      rolle: Rolle;
      erstellt_am: string;
      laeuft_ab: string;
      bezeichnung: string;
      ort_name: string | null;
      ort_slug: string | null;
      erstellt_von: string | null;
    }>(
      this.db,
      `SELECT e.id::text, e.rolle, e.erstellt_am::text, e.laeuft_ab::text, e.bezeichnung,
              o.name AS ort_name, o.slug AS ort_slug, c.name AS erstellt_von
         FROM einladung e LEFT JOIN ort o ON o.id = e.ort_id
         LEFT JOIN admin c ON c.id = e.erstellt_von
        WHERE e.genutzt_am IS NULL AND e.laeuft_ab > now() ORDER BY e.erstellt_am DESC`,
      [],
    );
    return rows.map(zuEinladung);
  }

  async widerrufe(id: string): Promise<boolean> {
    if (!/^\d{1,18}$/.test(id)) return false;
    const r = await abfrage(
      this.db,
      'DELETE FROM einladung WHERE id = $1::bigint AND genutzt_am IS NULL',
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  }
}

/**
 * Neues Konto mit erstem Passkey in EINER Transaktion. Die Bedingung wird in derselben Transaktion
 * geprüft: erster Admin (Advisory Lock, noch kein Admin) bzw. Einladung (offen → verbraucht).
 */
export class PgKontoAnlage implements KontoAnlage {
  constructor(private readonly db: pg.Pool) {}

  async lege(
    k: NeuesKonto,
    s: RegistrierterSchluessel,
    passkeyName: string,
    bedingung: Anlagebedingung,
  ): Promise<string | null> {
    const c = await this.db.connect();
    let einladung: { rolle: Rolle; ort_id: string | null } | null = null;
    try {
      await c.query('BEGIN');
      if (bedingung.art === 'erster-admin') {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('kirmes_erster_admin'))");
        const { rows } = await c.query("SELECT 1 FROM admin WHERE rolle = 'admin' LIMIT 1");
        if (rows.length) {
          await c.query('ROLLBACK');
          return null;
        }
      } else {
        // Einladung genau einmal verbrauchen – parallel nur einer erfolgreich (Zeilensperre)
        const { rows } = await c.query<{ rolle: Rolle; ort_id: string | null }>(
          `UPDATE einladung SET genutzt_am = now()
            WHERE id = $1::bigint AND genutzt_am IS NULL AND laeuft_ab > now()
            RETURNING rolle, ort_id::text`,
          [bedingung.einladungId],
        );
        if (!rows.length) {
          await c.query('ROLLBACK');
          return null;
        }
        // Rolle und Ort kommen aus der Einladung in der Datenbank, nie aus dem Browser (Issue #180)
        einladung = rows[0] as { rolle: Rolle; ort_id: string | null }; // Länge oben geprüft
      }
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO admin (name, rolle, handle, ort_id) VALUES ($1, $2, $3::uuid, $4::bigint)
         RETURNING id::text`,
        [k.name, einladung?.rolle ?? k.rolle, k.kennung, einladung?.ort_id ?? null],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('INSERT lieferte kein Konto');
      await c.query(
        `INSERT INTO admin_passkey (admin_id, credential_id, public_key, zaehler, transports, name)
         VALUES ($1::bigint, $2, $3, $4, $5, $6)`,
        [id, s.credentialId, Buffer.from(s.publicKey), s.zaehler, s.transports, passkeyName],
      );
      if (bedingung.art === 'einladung') {
        await c.query('UPDATE einladung SET genutzt_von = $2::bigint WHERE id = $1::bigint', [
          bedingung.einladungId,
          id,
        ]);
      }
      await c.query('COMMIT');
      return id;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
