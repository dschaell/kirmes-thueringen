import type {
  KontoKennung,
  NeuerPasskey,
  Passkey,
  PasskeyInfo,
  PasskeyRepository,
} from '@kirmes/core';
import type pg from 'pg';
import { abfrage } from './pool.js';

interface Zeile {
  id: string;
  admin_id: string;
  credential_id: string;
  public_key: Buffer;
  zaehler: string;
  transports: string[];
  name: string;
  erstellt_am: string;
  zuletzt_genutzt: string | null;
}

const SPALTEN = `id::text, admin_id::text, credential_id, public_key, zaehler::text, transports, name,
  erstellt_am::text, zuletzt_genutzt::text`;

const zuPasskey = (z: Zeile): Passkey => ({
  id: z.id,
  adminId: z.admin_id,
  credentialId: z.credential_id,
  publicKey: new Uint8Array(z.public_key),
  zaehler: Number(z.zaehler),
  transports: z.transports,
  name: z.name,
  erstelltAm: z.erstellt_am,
  zuletztGenutzt: z.zuletzt_genutzt,
});

export class PgPasskeys implements PasskeyRepository {
  constructor(private readonly db: pg.Pool) {}

  async konto(adminId: string): Promise<KontoKennung | null> {
    if (!/^\d{1,18}$/.test(adminId)) return null;
    const { rows } = await abfrage<{ handle: string; name: string }>(
      this.db,
      'SELECT handle::text, name FROM admin WHERE id = $1::bigint',
      [adminId],
    );
    return rows[0] ? { kennung: rows[0].handle, name: rows[0].name } : null;
  }

  async liste(adminId: string): Promise<Passkey[]> {
    const { rows } = await abfrage<Zeile>(
      this.db,
      `SELECT ${SPALTEN} FROM admin_passkey WHERE admin_id = $1::bigint ORDER BY erstellt_am`,
      [adminId],
    );
    return rows.map(zuPasskey);
  }

  async findeNachCredential(credentialId: string): Promise<Passkey | null> {
    const { rows } = await abfrage<Zeile>(
      this.db,
      `SELECT ${SPALTEN} FROM admin_passkey WHERE credential_id = $1`,
      [credentialId],
    );
    return rows[0] ? zuPasskey(rows[0]) : null;
  }

  async lege(p: NeuerPasskey): Promise<PasskeyInfo> {
    const { rows } = await abfrage<Zeile>(
      this.db,
      `INSERT INTO admin_passkey (admin_id, credential_id, public_key, zaehler, transports, name)
       VALUES ($1::bigint, $2, $3, $4, $5, $6) RETURNING ${SPALTEN}`,
      [p.adminId, p.credentialId, Buffer.from(p.publicKey), p.zaehler, p.transports, p.name],
    );
    const zeile = rows[0];
    if (!zeile) throw new Error('INSERT lieferte keinen Passkey');
    const { id, name, erstelltAm, zuletztGenutzt } = zuPasskey(zeile);
    return { id, name, erstelltAm, zuletztGenutzt };
  }

  async merkeNutzung(id: string, zaehler: number): Promise<void> {
    await abfrage(
      this.db,
      'UPDATE admin_passkey SET zaehler = $2, zuletzt_genutzt = now() WHERE id = $1::bigint',
      [id, zaehler],
    );
  }

  async loesche(adminId: string, id: string): Promise<boolean> {
    if (!/^\d{1,18}$/.test(id)) return false;
    const r = await abfrage(
      this.db,
      'DELETE FROM admin_passkey WHERE id = $1::bigint AND admin_id = $2::bigint',
      [id, adminId],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
