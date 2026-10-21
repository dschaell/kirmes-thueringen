/** Integrationstests des Redaktionszugangs gegen PostgreSQL (nur mit DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeKryptografie } from '../src/infrastructure/krypto.js';
import {
  ortLandkreis,
  PgAdminKonten,
  PgEinladungen,
  PgKontoAnlage,
  PgMitglieder,
  PgLinkVerwaltung,
  PgMitteilungen,
  PgOrtVerwaltung,
  PgSitzungen,
} from '../src/infrastructure/postgres/admin-repository.js';
import {
  PgBearbeitungslinks,
  PgFestplatzRepository,
} from '../src/infrastructure/postgres/festplatz-repository.js';
import { terminVorschlaege } from '../src/infrastructure/postgres/termin-verwaltung.js';
import { erstellePool } from '../src/infrastructure/postgres/pool.js';
import { PgPasskeys } from '../src/infrastructure/postgres/passkey-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();

describe.runIf(url)('Redaktion (PostgreSQL)', () => {
  const pool = erstellePool({
    connectionString: url ?? '',
    ssl: false,
    maxVerbindungen: 2,
    statementTimeoutMs: 5_000,
  });
  const krypto = new NodeKryptografie();
  let adminId = '';

  beforeAll(async () => {
    await pool.query(
      "DELETE FROM vorschlag WHERE ort_id IN (SELECT id FROM ort WHERE slug LIKE 'it-admin-%')",
    );
    await pool.query("DELETE FROM ort WHERE slug LIKE 'it-admin-%'");
    await pool.query("DELETE FROM mitteilung WHERE titel LIKE 'IT %'");
    await pool.query("DELETE FROM admin WHERE name = 'IT Redaktion'");
    const r = await pool.query<{ id: string }>(
      `INSERT INTO admin (name, rolle) VALUES ('IT Redaktion', 'redaktion') RETURNING id::text`,
    );
    adminId = r.rows[0]!.id;
    await pool.query(
      `INSERT INTO ort (slug, name, landkreis) VALUES ('it-admin-ort', 'IT-Adminort', 'GTH')`,
    );
  });
  afterAll(async () => {
    await pool.query("DELETE FROM ort WHERE slug LIKE 'it-admin-%'");
    await pool.query("DELETE FROM mitteilung WHERE titel LIKE 'IT %'");
    await pool.query("DELETE FROM admin WHERE name = 'IT Redaktion'");
    await pool.end();
  });

  it('Passkeys: anlegen, finden, Nutzung merken, nur eigene löschen', async () => {
    const repo = new PgPasskeys(pool);
    const credentialId = 'it-passkey-ABCDEFGHIJKLMNOP';
    const info = await repo.lege({
      adminId,
      credentialId,
      publicKey: new Uint8Array([1, 2, 3]),
      zaehler: 0,
      transports: ['internal', 'hybrid'],
      name: 'IT-Gerät',
    });
    expect(info).toMatchObject({ name: 'IT-Gerät', zuletztGenutzt: null });
    expect(await repo.konto(adminId)).toEqual({
      kennung: expect.any(String),
      name: 'IT Redaktion',
    });
    expect(await repo.konto('x')).toBeNull();
    const p = await repo.findeNachCredential(credentialId);
    expect(p).toMatchObject({ adminId, zaehler: 0, transports: ['internal', 'hybrid'] });
    expect([...p!.publicKey]).toEqual([1, 2, 3]);
    await repo.merkeNutzung(info.id, 7);
    const [nachher] = await repo.liste(adminId);
    expect(nachher).toMatchObject({ zaehler: 7 });
    expect(nachher!.zuletztGenutzt).not.toBeNull();
    expect(await repo.findeNachCredential('gibt-es-nicht-1234567')).toBeNull();
    // gleiche Credential-ID zweimal ist ausgeschlossen
    await expect(
      repo.lege({
        adminId,
        credentialId,
        publicKey: new Uint8Array([1]),
        zaehler: 0,
        transports: [],
        name: 'x',
      }),
    ).rejects.toThrow();
    expect(await repo.loesche('999999', info.id)).toBe(false);
    expect(await repo.loesche(adminId, 'kein-id')).toBe(false);
    expect(await repo.loesche(adminId, info.id)).toBe(true);
    expect(await repo.liste(adminId)).toEqual([]);
  });

  it('Konto und Sitzung: anlegen, prüfen, ablaufen, beenden', async () => {
    const konten = new PgAdminKonten(pool);
    await konten.merkeLogin(adminId);
    const login = await pool.query('SELECT letzter_login FROM admin WHERE id = $1', [adminId]);
    expect(login.rows[0].letzter_login).not.toBeNull();

    const sitzungen = new PgSitzungen(pool);
    const token = krypto.neuesToken();
    await sitzungen.lege(adminId, token, 12);
    expect(await sitzungen.pruefe(token)).toEqual({
      adminId,
      name: 'IT Redaktion',
      rolle: 'redaktion',
      ortSlug: null,
      ortName: null,
    });
    expect(await sitzungen.pruefe(krypto.neuesToken())).toBeNull();
    expect(await sitzungen.pruefe("' OR 1=1 --")).toBeNull();
    // abgelaufene Sitzung
    const alt = krypto.neuesToken();
    await sitzungen.lege(adminId, alt, 0);
    expect(await sitzungen.pruefe(alt)).toBeNull();
    await sitzungen.beende(token);
    expect(await sitzungen.pruefe(token)).toBeNull();
  });

  it('Plätze durch die Redaktion: Protokoll mit Admin-ID (#62)', async () => {
    const repo = new PgFestplatzRepository(pool);
    const durch = {
      linkId: null,
      adminId,
      ortSlug: 'it-admin-ort',
      landkreis: 'GTH',
      bezeichnung: 'Redaktion',
    };
    await repo.speichere(
      'it-admin-ort',
      { name: 'IT-Kirche', koordinate: { lat: 50.95, lon: 10.7 } },
      durch,
    );
    const u = await repo.uebersicht('it-admin-ort');
    expect(u?.festplaetze.map((f) => f.name)).toContain('IT-Kirche');
    const p = await pool.query(
      `SELECT admin_id::text, link_id FROM aenderungsprotokoll
        WHERE aktion = 'festplatz_gespeichert' AND details->>'name' = 'IT-Kirche'`,
    );
    expect(p.rows.at(-1)).toEqual({ admin_id: adminId, link_id: null });
    expect(await repo.loesche('it-admin-ort', 'IT-Kirche', durch)).toBe(true);
  });

  it('Plätze umbenennen, Übersicht, Ortsmitte (#216)', async () => {
    const repo = new PgFestplatzRepository(pool);
    const durch = {
      linkId: null,
      adminId,
      ortSlug: 'it-admin-ort',
      landkreis: 'GTH',
      bezeichnung: 'Redaktion',
    };
    const ort = (await pool.query<{ id: string }>("SELECT id FROM ort WHERE slug = 'it-admin-ort'"))
      .rows[0]!.id;
    await pool.query(
      `INSERT INTO termin (ort_id, datum, titel, kategorie, veranstaltungsort)
       VALUES ($1, '2026-11-20', 'IT-Platz-A', 'party', 'IT Kirche'),
              ($1, '2026-11-21', 'IT-Platz-B', 'tradition', 'IT Kirche'),
              ($1, '2026-11-22', 'IT-Platz-C', 'party', 'IT Saal'),
              ($1, '2026-11-23', 'IT-Platz-D', 'party', NULL)`,
      [ort],
    );
    try {
      await repo.speichere(
        'it-admin-ort',
        { name: 'IT Kirche', koordinate: { lat: 50.9, lon: 10.7 } },
        durch,
      );
      await repo.speichere(
        'it-admin-ort',
        { name: 'IT Festzelt', koordinate: { lat: 50.91, lon: 10.71 } },
        durch,
      );
      const u = await repo.uebersicht('it-admin-ort');
      expect(u?.plaetze).toEqual([
        { name: 'IT Festzelt', termine: 0, koordinate: { lat: 50.91, lon: 10.71 } },
        { name: 'IT Kirche', termine: 2, koordinate: { lat: 50.9, lon: 10.7 } },
        { name: 'IT Saal', termine: 1, koordinate: null },
      ]);
      expect(u?.eigenerOrt).toBe(false);

      // beide mit Kartenpunkt → abgelehnt, nichts geändert
      expect(await repo.benenneUm('it-admin-ort', 'IT Kirche', 'IT Festzelt', durch)).toBe(
        'konflikt',
      );
      expect(await repo.benenneUm('it-admin-ort', 'IT Gibtsnicht', 'X', durch)).toBe('unbekannt');
      expect(await repo.benenneUm('it-gibtsnicht', 'IT Kirche', 'X', durch)).toBe('unbekannt');

      // Termine + Kartenpunkt ziehen mit, Version steigt
      expect(await repo.benenneUm('it-admin-ort', 'IT Kirche', 'IT St. Marien', durch)).toBe(
        'umbenannt',
      );
      // nur Termine (ohne Kartenpunkt) in einen vorhandenen Platz zusammenführen
      expect(await repo.benenneUm('it-admin-ort', 'IT Saal', 'IT Festzelt', durch)).toBe(
        'umbenannt',
      );
      const t = await pool.query<{
        titel: string;
        veranstaltungsort: string | null;
        version: string;
      }>(
        "SELECT titel, veranstaltungsort, version::text FROM termin WHERE titel LIKE 'IT-Platz-%' ORDER BY titel",
      );
      expect(t.rows).toEqual([
        { titel: 'IT-Platz-A', veranstaltungsort: 'IT St. Marien', version: '2' },
        { titel: 'IT-Platz-B', veranstaltungsort: 'IT St. Marien', version: '2' },
        { titel: 'IT-Platz-C', veranstaltungsort: 'IT Festzelt', version: '2' },
        { titel: 'IT-Platz-D', veranstaltungsort: null, version: '1' },
      ]);
      expect(
        (await repo.uebersicht('it-admin-ort'))?.plaetze.map((p) => [
          p.name,
          p.termine,
          !!p.koordinate,
        ]),
      ).toEqual([
        ['IT Festzelt', 1, true],
        ['IT St. Marien', 2, true],
      ]);
      const prot = await pool.query(
        "SELECT details->>'neu' AS neu FROM aenderungsprotokoll WHERE aktion = 'platz_umbenannt' AND ort_id = $1 ORDER BY id",
        [ort],
      );
      expect(prot.rows.map((r) => r.neu)).toEqual(['IT St. Marien', 'IT Festzelt']);

      // Ortsmitte
      expect(await repo.setzeOrtsmitte('it-admin-ort', { lat: 50.95, lon: 10.75 }, durch)).toBe(
        true,
      );
      expect((await repo.uebersicht('it-admin-ort'))?.ort.koordinate).toEqual({
        lat: 50.95,
        lon: 10.75,
      });
      expect(await repo.setzeOrtsmitte('it-gibtsnicht', { lat: 50.95, lon: 10.75 }, durch)).toBe(
        false,
      );
    } finally {
      await pool.query("DELETE FROM termin WHERE titel LIKE 'IT-Platz-%'");
      await pool.query('DELETE FROM festplatz WHERE ort_id = $1', [ort]);
    }
  });

  it('Ort ändern: nur selbst angelegte Orte, Slug bleibt (#216)', async () => {
    const orte = new PgOrtVerwaltung(pool);
    await orte.lege(
      { slug: 'it-admin-eigen', name: 'IT Eigen', landkreis: 'GTH', koordinate: null },
      adminId,
    );
    expect(
      await orte.aendere('it-admin-eigen', { name: 'IT Eigen Neu', landkreis: 'IK' }, adminId),
    ).toBe('geaendert');
    const r = await pool.query("SELECT name, landkreis FROM ort WHERE slug = 'it-admin-eigen'");
    expect(r.rows[0]).toEqual({ name: 'IT Eigen Neu', landkreis: 'IK' });
    expect(await orte.aendere('it-admin-ort', { name: 'X', landkreis: 'IK' }, adminId)).toBe(
      'ortsverzeichnis',
    );
    expect(await orte.aendere('it-admin-gibtsnicht', { name: 'X', landkreis: 'IK' }, adminId)).toBe(
      'unbekannt',
    );
    const o = await pool.query("SELECT name FROM ort WHERE slug = 'it-admin-ort'");
    expect(o.rows[0].name).toBe('IT-Adminort');
  });

  it('Vorschläge: Bands und Titel aus allen Terminen, häufigste zuerst (#62)', async () => {
    // eigene Testdaten – die Datenbank kann (wie in der CI) sonst leer sein
    const ort = await pool.query<{ id: string }>("SELECT id FROM ort WHERE slug = 'it-admin-ort'");
    await pool.query(
      `INSERT INTO termin (ort_id, datum, titel, kategorie, band)
       VALUES ($1, '2026-10-30', 'IT-Vorschlag', 'party', 'IT-Band-Vorschlag'),
              ($1, '2026-10-31', 'IT-Vorschlag', 'party', 'IT-Band-Vorschlag')`,
      [ort.rows[0]!.id],
    );
    try {
      const v = await terminVorschlaege(pool);
      expect(v.bands).toContain('IT-Band-Vorschlag');
      expect(v.titel).toContain('IT-Vorschlag');
      expect(v.bands.every((b) => b.length > 0)).toBe(true);
    } finally {
      await pool.query("DELETE FROM termin WHERE titel = 'IT-Vorschlag'");
    }
  });

  it('Mitteilungen: nur veröffentlichte, neueste zuerst', async () => {
    const m = new PgMitteilungen(pool);
    const a = await m.lege({ titel: 'IT Erste', text: 'a', link: null }, adminId);
    const b = await m.lege({ titel: 'IT Zweite', text: 'b', link: '/orte' }, adminId);
    expect((await m.liste()).map((x) => x.titel).slice(0, 2)).toEqual(['IT Zweite', 'IT Erste']);
    await m.setzeVeroeffentlicht(a.id, true);
    expect((await m.aktuelle())?.id).toBe(a.id);
    await m.setzeVeroeffentlicht(b.id, true);
    expect((await m.aktuelle())?.titel).toBe('IT Zweite');
    await m.setzeVeroeffentlicht(b.id, false);
    expect((await m.aktuelle())?.id).toBe(a.id);
    expect(await m.loesche(b.id)).toBe(true);
    expect(await m.loesche(b.id)).toBe(false);
    expect(await m.setzeVeroeffentlicht('999999999', true)).toBe(false);
  });

  it('Orte: Redaktion legt an, doppelte Adressen werden abgelehnt', async () => {
    const o = new PgOrtVerwaltung(pool);
    const neu = await o.lege(
      {
        slug: 'it-admin-neu',
        name: 'IT-Neu',
        landkreis: 'WL',
        koordinate: { lat: 50.95, lon: 11.2 },
      },
      adminId,
    );
    expect(neu?.slug).toBe('it-admin-neu');
    expect(
      await o.lege(
        { slug: 'it-admin-neu', name: 'IT-Neu', landkreis: 'WL', koordinate: null },
        adminId,
      ),
    ).toBeNull();
    const herkunft = await pool.query("SELECT herkunft FROM ort WHERE slug = 'it-admin-neu'");
    expect(herkunft.rows[0]?.herkunft).toBe('redaktion');
    expect(await ortLandkreis(pool)('it-admin-neu')).toBe('WL');
    expect(await ortLandkreis(pool)('it-admin-gibtsnicht')).toBeNull();
  });

  it('Orte löschen: nur selbst angelegte ohne Termine und Vorschläge (Issue #159)', async () => {
    const o = new PgOrtVerwaltung(pool);
    for (const slug of ['it-admin-weg', 'it-admin-termin', 'it-admin-vorschlag'])
      await o.lege({ slug, name: slug, landkreis: 'GTH', koordinate: null }, adminId);
    await pool.query(
      `INSERT INTO termin (ort_id, datum, titel, kategorie)
       SELECT id, '2026-10-17', 'IT Tanz', 'party' FROM ort WHERE slug = 'it-admin-termin'`,
    );
    const v = await pool.query<{ id: string }>(
      `INSERT INTO vorschlag (ort_id) SELECT id FROM ort WHERE slug = 'it-admin-vorschlag'
       RETURNING id::text`,
    );
    const eigene = (await o.eigene()).filter((x) => x.slug.startsWith('it-admin-'));
    expect(eigene.map((x) => [x.slug, x.termine, x.vorschlaege])).toEqual(
      expect.arrayContaining([
        ['it-admin-weg', 0, 0],
        ['it-admin-termin', 1, 0],
        ['it-admin-vorschlag', 0, 1],
      ]),
    );
    expect(eigene.some((x) => x.slug === 'it-admin-ort')).toBe(false);
    expect(await o.loesche('it-admin-ort', adminId)).toBe('ortsverzeichnis');
    expect(await o.loesche('it-admin-termin', adminId)).toBe('belegt');
    expect(await o.loesche('it-admin-vorschlag', adminId)).toBe('belegt');
    expect(await o.loesche('it-admin-gibtsnicht', adminId)).toBe('unbekannt');
    expect(await o.loesche('it-admin-weg', adminId)).toBe('geloescht');
    expect(await o.loesche('it-admin-weg', adminId)).toBe('unbekannt');
    const p = await pool.query(
      `SELECT details FROM aenderungsprotokoll
        WHERE aktion = 'ort_geloescht' AND admin_id = $1::bigint`,
      [adminId],
    );
    expect(p.rows.at(-1)?.details).toEqual({ slug: 'it-admin-weg', name: 'it-admin-weg' });
    await pool.query('DELETE FROM vorschlag WHERE id = $1', [v.rows[0]!.id]);
  });

  it('Kirmesgesellschaft: Einladung mit Ort → Konto mit Ort → Sitzung kennt den Ort (Issue #180)', async () => {
    const einladungen = new PgEinladungen(pool);
    expect(
      await einladungen.lege(
        krypto.neuesToken(),
        'kirmesgesellschaft',
        adminId,
        7,
        'KG',
        'it-admin-gibtsnicht',
      ),
    ).toBeNull();
    const token = krypto.neuesToken();
    const e = await einladungen.lege(
      token,
      'kirmesgesellschaft',
      adminId,
      7,
      'KG Adminort',
      'it-admin-ort',
    );
    expect(e).toMatchObject({
      rolle: 'kirmesgesellschaft',
      ortName: 'IT-Adminort',
      ortSlug: 'it-admin-ort',
    });
    // Ort-Schlüssel und wer eingeladen hat (Issue #231)
    expect((await einladungen.offene()).find((x) => x.id === e!.id)).toMatchObject({
      ortName: 'IT-Adminort',
      ortSlug: 'it-admin-ort',
      erstelltVon: 'IT Redaktion',
    });
    // Rolle/Ort kommen aus der Einladung – auch wenn der Browser „admin“ behauptet
    const kontoId = await new PgKontoAnlage(pool).lege(
      { name: 'IT KG', rolle: 'admin', kennung: '00000000-0000-4000-8000-0000000000c1' },
      {
        credentialId: 'it-kg-ABCDEFGHIJKLMNOP',
        publicKey: new Uint8Array([1]),
        zaehler: 0,
        transports: [],
      },
      'Erster Passkey',
      { art: 'einladung', einladungId: e!.id },
    );
    expect(kontoId).toBeTruthy();
    const sitzungen = new PgSitzungen(pool);
    const st = krypto.neuesToken();
    await sitzungen.lege(kontoId!, st, 1);
    expect(await sitzungen.pruefe(st)).toMatchObject({
      rolle: 'kirmesgesellschaft',
      ortSlug: 'it-admin-ort',
      ortName: 'IT-Adminort',
    });
    const m = new PgMitglieder(pool);
    expect((await m.liste()).find((x) => x.id === kontoId)).toMatchObject({
      ortName: 'IT-Adminort',
      ortSlug: 'it-admin-ort',
    });
    // Ort mit KG-Konto lässt sich nicht löschen; wird sie Redaktion, fällt der Ort weg
    await pool.query("UPDATE ort SET herkunft = 'redaktion' WHERE slug = 'it-admin-ort'");
    expect(await new PgOrtVerwaltung(pool).loesche('it-admin-ort', adminId)).toBe('belegt');
    await pool.query("UPDATE ort SET herkunft = 'osm' WHERE slug = 'it-admin-ort'");
    expect(await m.setzeRolle(kontoId!, 'redaktion')).toBe(true);
    expect(await sitzungen.pruefe(st)).toMatchObject({ rolle: 'redaktion', ortSlug: null });
    await pool.query('DELETE FROM admin WHERE id = $1::bigint', [kontoId]);
  });

  it('Links: erstellen, auflisten, prüfen, sperren', async () => {
    const l = new PgLinkVerwaltung(pool);
    const token = krypto.neuesToken();
    const link = await l.erstelle('it-admin-ort', 'IT-KG', token);
    expect(link).toMatchObject({
      ortSlug: 'it-admin-ort',
      ortName: 'IT-Adminort',
      bezeichnung: 'IT-KG',
    });
    expect(await l.erstelle('it-admin-gibtsnicht', 'x', krypto.neuesToken())).toBeNull();
    expect((await l.liste()).some((x) => x.id === link!.id)).toBe(true);
    expect((await new PgBearbeitungslinks(pool).pruefe(token))?.ortSlug).toBe('it-admin-ort');
    expect(await l.sperre(link!.id)).toBe(true);
    expect(await l.sperre(link!.id)).toBe(false);
    expect(await new PgBearbeitungslinks(pool).pruefe(token)).toBeNull();
  });
});
