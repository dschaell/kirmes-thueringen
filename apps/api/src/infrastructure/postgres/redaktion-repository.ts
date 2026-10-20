/** Redaktionsdaten: Mitteilungen, Orte, Bearbeitungslinks (Issue #199: aus admin-repository.ts ausgelagert). */
import type {
  EigenerOrt,
  OrtAendern,
  OrtLoeschen,
  LandkreisKuerzel,
  LinkInfo,
  LinkVerwaltung,
  Mitteilung,
  MitteilungRepository,
  NeueMitteilung,
  NeuerOrt,
  Ort,
  OrtVerwaltung,
} from '@kirmes/core';
import type pg from 'pg';
import { hashToken } from './festplatz-repository.js';
import { abfrage } from './pool.js';

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

  async eigene(): Promise<EigenerOrt[]> {
    const { rows } = await abfrage<EigenerOrt>(
      this.db,
      `SELECT o.slug, o.name, o.landkreis,
              (SELECT count(*)::int FROM termin t WHERE t.ort_id = o.id) AS termine,
              (SELECT count(*)::int FROM vorschlag v WHERE v.ort_id = o.id) AS vorschlaege
         FROM ort o WHERE o.herkunft = 'redaktion' ORDER BY o.name, o.slug`,
      [],
    );
    return rows;
  }

  /** Name/Landkreis ändern – nur selbst angelegte Orte (Issue #216); Slug bleibt, protokolliert. */
  async aendere(
    slug: string,
    o: { name: string; landkreis: string },
    adminId: string,
  ): Promise<OrtAendern> {
    const { rows } = await abfrage<{ id: string; geaendert: boolean }>(
      this.db,
      `WITH alt AS (SELECT id FROM ort WHERE slug = $1),
            neu AS (UPDATE ort SET name = $2, landkreis = $3
                     WHERE id = (SELECT id FROM alt) AND herkunft = 'redaktion' RETURNING id)
       SELECT alt.id::text, EXISTS (SELECT 1 FROM neu) AS geaendert FROM alt`,
      [slug, o.name, o.landkreis],
    );
    const r = rows[0];
    if (!r) return 'unbekannt';
    if (!r.geaendert) return 'ortsverzeichnis';
    await abfrage(
      this.db,
      `INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details) VALUES ($1, $2, 'ort_geaendert', $3)`,
      [adminId, r.id, { slug, ...o }],
    );
    return 'geaendert';
  }

  async loesche(slug: string, adminId: string): Promise<OrtLoeschen> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      // Sperrt den Ort, damit nicht gleichzeitig ein Termin angelegt wird (termin hängt per CASCADE dran)
      const { rows } = await c.query<{
        id: string;
        name: string;
        herkunft: string;
        belegt: boolean;
      }>(
        `SELECT o.id::text, o.name, o.herkunft,
                EXISTS (SELECT 1 FROM termin t WHERE t.ort_id = o.id)
                  OR EXISTS (SELECT 1 FROM vorschlag v WHERE v.ort_id = o.id)
                  OR EXISTS (SELECT 1 FROM admin a WHERE a.ort_id = o.id) AS belegt
           FROM ort o WHERE o.slug = $1 FOR UPDATE`,
        [slug],
      );
      const o = rows[0];
      const ergebnis: OrtLoeschen = !o
        ? 'unbekannt'
        : o.herkunft !== 'redaktion'
          ? 'ortsverzeichnis'
          : o.belegt
            ? 'belegt'
            : 'geloescht';
      if (o && ergebnis === 'geloescht') {
        await c.query('DELETE FROM ort WHERE id = $1::bigint', [o.id]);
        await c.query(
          `INSERT INTO aenderungsprotokoll (admin_id, ort_id, aktion, details)
           VALUES ($1, NULL, 'ort_geloescht', $2)`,
          [adminId, { slug, name: o.name }],
        );
      }
      await c.query('COMMIT');
      return ergebnis;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
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
