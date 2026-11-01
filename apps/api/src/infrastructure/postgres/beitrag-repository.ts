import type { Beitrag, BeitragAblage, Plakatbild, PlakatGroesse } from '@kirmes/core';
import type pg from 'pg';

/** Beiträge mit Fotos (Issue #352) – Fotos liegen in der Datenbank und damit in den Sicherungen. */
const SQL_LEGEN = `
INSERT INTO beitrag (ort_id, termin_id, text, erstellt_von)
SELECT o.id, $2::uuid, $3, $4 FROM ort o WHERE o.slug = $1
RETURNING id::text`;
const SQL_TERMIN_IM_ORT = `
SELECT 1 FROM termin t JOIN ort o ON o.id = t.ort_id WHERE t.id = $1::uuid AND o.slug = $2`;
const SQL_STAND = `
SELECT o.slug, b.veroeffentlicht_am IS NOT NULL AS veroeffentlicht, b.text,
       (SELECT count(*)::int FROM beitrag_foto f WHERE f.beitrag_id = b.id) AS fotos
  FROM beitrag b JOIN ort o ON o.id = b.ort_id WHERE b.id = $1::uuid`;
const SQL_FOTOS_IM_ORT = `
SELECT count(*)::int AS n FROM beitrag_foto f
  JOIN beitrag b ON b.id = f.beitrag_id JOIN ort o ON o.id = b.ort_id WHERE o.slug = $1`;
const SQL_FOTO_LEGEN = `
INSERT INTO beitrag_foto (beitrag_id, nr, gross, klein, breite, hoehe, alt)
VALUES ($1::uuid, $2, $3, $4, $5, $6, $7) RETURNING id::text`;
const SQL_VEROEFFENTLICHEN = `
UPDATE beitrag SET veroeffentlicht_am = clock_timestamp()
 WHERE id = $1::uuid AND veroeffentlicht_am IS NULL RETURNING ort_id`;
const SQL_LOESCHEN = `DELETE FROM beitrag WHERE id = $1::uuid RETURNING ort_id`;
const SQL_PROTOKOLL = `
INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details)
VALUES ($1, $2, $3, jsonb_build_object('id', $4::text))`;
const SQL_FOTO_GROSS = `
SELECT f.gross AS bild FROM beitrag_foto f JOIN beitrag b ON b.id = f.beitrag_id
 WHERE f.id = $1::uuid AND b.veroeffentlicht_am IS NOT NULL`;
const SQL_FOTO_KLEIN = SQL_FOTO_GROSS.replace('f.gross', 'f.klein');
// Liste: veröffentlichte Beiträge, neueste zuerst; Fotos ohne Bilddaten
const SQL_LISTE = `
SELECT b.id::text, o.slug AS ort_slug, o.name AS ort_name, o.kg_name, b.text,
       to_char(b.veroeffentlicht_am AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS am,
       t.id::text AS termin_id, t.titel AS termin_titel, t.datum::text AS termin_datum,
       COALESCE((SELECT json_agg(json_build_object('id', f.id, 'breite', f.breite,
                                                   'hoehe', f.hoehe, 'alt', f.alt) ORDER BY f.nr)
                   FROM beitrag_foto f WHERE f.beitrag_id = b.id), '[]') AS fotos
  FROM beitrag b
  JOIN ort o ON o.id = b.ort_id
  LEFT JOIN termin t ON t.id = b.termin_id
 WHERE b.veroeffentlicht_am IS NOT NULL
   AND ($1::text IS NULL OR o.slug = $1)
   AND ($2::timestamptz IS NULL OR b.veroeffentlicht_am < $2)
   AND ($4::uuid IS NULL OR b.id = $4)
 ORDER BY b.veroeffentlicht_am DESC
 LIMIT $3`;

interface Zeile {
  id: string;
  ort_slug: string;
  ort_name: string;
  kg_name: string | null;
  text: string;
  am: string;
  termin_id: string | null;
  termin_titel: string | null;
  termin_datum: string | null;
  fotos: Beitrag['fotos'];
}
const alsBeitrag = (z: Zeile): Beitrag => ({
  id: z.id,
  ortSlug: z.ort_slug,
  ortName: z.ort_name,
  kgName: z.kg_name,
  text: z.text,
  termin:
    z.termin_id && z.termin_titel && z.termin_datum
      ? { id: z.termin_id, titel: z.termin_titel, datum: z.termin_datum }
      : null,
  veroeffentlichtAm: z.am,
  fotos: z.fotos,
});

export class PgBeitraege implements BeitragAblage {
  constructor(private readonly db: pg.Pool) {}

  async lege(
    b: { ortSlug: string; text: string; terminId: string | null },
    adminId: string,
  ): Promise<string | null> {
    const r = await this.db.query<{ id: string }>(SQL_LEGEN, [
      b.ortSlug,
      b.terminId,
      b.text,
      adminId,
    ]);
    return r.rows[0]?.id ?? null;
  }

  async terminImOrt(terminId: string, ortSlug: string): Promise<boolean> {
    return (await this.db.query(SQL_TERMIN_IM_ORT, [terminId, ortSlug])).rowCount === 1;
  }

  async stand(beitragId: string) {
    const r = await this.db.query<{
      slug: string;
      veroeffentlicht: boolean;
      text: string;
      fotos: number;
    }>(SQL_STAND, [beitragId]);
    const z = r.rows[0];
    return z
      ? { ortSlug: z.slug, veroeffentlicht: z.veroeffentlicht, fotos: z.fotos, text: z.text }
      : null;
  }

  async fotosImOrt(ortSlug: string): Promise<number> {
    // count(*) liefert immer genau eine Zeile
    const [z] = (await this.db.query<{ n: number }>(SQL_FOTOS_IM_ORT, [ortSlug])).rows as [
      { n: number },
    ];
    return z.n;
  }

  async legeFoto(beitragId: string, nr: number, b: Plakatbild, alt: string): Promise<string> {
    // INSERT … RETURNING liefert immer genau eine Zeile (sonst wirft die Datenbank)
    const r = await this.db.query<{ id: string }>(SQL_FOTO_LEGEN, [
      beitragId,
      nr,
      Buffer.from(b.gross),
      Buffer.from(b.klein),
      b.breite,
      b.hoehe,
      alt,
    ]);
    const [zeile] = r.rows as [{ id: string }];
    return zeile.id;
  }

  /** Ändern und Protokoll in einem Schritt */
  private async mitProtokoll(sql: string, beitragId: string, adminId: string, aktion: string) {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query<{ ort_id: string }>(sql, [beitragId]);
      const ort = r.rows[0]?.ort_id;
      if (ort) await c.query(SQL_PROTOKOLL, [adminId, ort, aktion, beitragId]);
      await c.query('COMMIT');
      return !!ort;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async veroeffentliche(beitragId: string, adminId: string): Promise<Beitrag | null> {
    if (
      !(await this.mitProtokoll(
        SQL_VEROEFFENTLICHEN,
        beitragId,
        adminId,
        'beitrag_veroeffentlicht',
      ))
    )
      return null;
    // gerade veröffentlicht – die Zeile gibt es
    const [z] = (await this.db.query<Zeile>(SQL_LISTE, [null, null, 1, beitragId])).rows as [Zeile];
    return alsBeitrag(z);
  }

  loesche(beitragId: string, adminId: string): Promise<boolean> {
    return this.mitProtokoll(SQL_LOESCHEN, beitragId, adminId, 'beitrag_geloescht');
  }

  async liste(f: { ortSlug?: string; vor?: string; limit: number }): Promise<Beitrag[]> {
    const r = await this.db.query<Zeile>(SQL_LISTE, [
      f.ortSlug ?? null,
      f.vor ?? null,
      f.limit,
      null,
    ]);
    return r.rows.map(alsBeitrag);
  }

  async foto(fotoId: string, groesse: PlakatGroesse): Promise<Uint8Array | null> {
    const r = await this.db.query<{ bild: Buffer }>(
      groesse === 'gross' ? SQL_FOTO_GROSS : SQL_FOTO_KLEIN,
      [fotoId],
    );
    return r.rows[0]?.bild ?? null;
  }
}
