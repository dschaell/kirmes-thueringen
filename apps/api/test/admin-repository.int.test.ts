/** Integrationstests des Redaktionszugangs gegen PostgreSQL (nur mit DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeKryptografie } from '../src/infrastructure/krypto.js';
import {
  ortLandkreis,
  PgAdminKonten,
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

  it('Vorschläge: Bands und Titel aus allen Terminen, häufigste zuerst (#62)', async () => {
    const v = await terminVorschlaege(pool);
    expect(Array.isArray(v.bands) && Array.isArray(v.titel)).toBe(true);
    expect(v.bands.every((b) => b.length > 0)).toBe(true);
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
