/** Integrationstests des Redaktionszugangs gegen PostgreSQL (nur mit DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashePasswort, NodeKryptografie } from '../src/infrastructure/krypto.js';
import {
  ortLandkreis,
  PgAdminKonten,
  PgLinkVerwaltung,
  PgMitteilungen,
  PgOrtVerwaltung,
  PgSitzungen,
} from '../src/infrastructure/postgres/admin-repository.js';
import { PgBearbeitungslinks } from '../src/infrastructure/postgres/festplatz-repository.js';
import { erstellePool } from '../src/infrastructure/postgres/pool.js';
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
    await pool.query("DELETE FROM admin WHERE email = 'it@test.invalid'");
    const r = await pool.query<{ id: string }>(
      `INSERT INTO admin (email, passwort_hash, totp_geheimnis) VALUES ('it@test.invalid', $1, 'GEZDGNBVGY3TQOJQ')
       RETURNING id::text`,
      [await hashePasswort('integrationstest-1234')],
    );
    adminId = r.rows[0]!.id;
    await pool.query(
      `INSERT INTO ort (slug, name, landkreis) VALUES ('it-admin-ort', 'IT-Adminort', 'GTH')`,
    );
  });
  afterAll(async () => {
    await pool.query("DELETE FROM ort WHERE slug LIKE 'it-admin-%'");
    await pool.query("DELETE FROM mitteilung WHERE titel LIKE 'IT %'");
    await pool.query("DELETE FROM admin WHERE email = 'it@test.invalid'");
    await pool.end();
  });

  it('Konto und Sitzung: anlegen, prüfen, ablaufen, beenden', async () => {
    const konten = new PgAdminKonten(pool);
    const konto = await konten.findeNachEmail('it@test.invalid');
    expect(konto?.id).toBe(adminId);
    expect(await krypto.pruefePasswort('integrationstest-1234', konto!.passwortHash)).toBe(true);
    expect(await konten.findeNachEmail('niemand@test.invalid')).toBeNull();
    await konten.merkeLogin(adminId);

    const sitzungen = new PgSitzungen(pool);
    const token = krypto.neuesToken();
    await sitzungen.lege(adminId, token, 12);
    expect(await sitzungen.pruefe(token)).toEqual({ adminId, email: 'it@test.invalid' });
    expect(await sitzungen.pruefe(krypto.neuesToken())).toBeNull();
    expect(await sitzungen.pruefe("' OR 1=1 --")).toBeNull();
    // abgelaufene Sitzung
    const alt = krypto.neuesToken();
    await sitzungen.lege(adminId, alt, 0);
    expect(await sitzungen.pruefe(alt)).toBeNull();
    await sitzungen.beende(token);
    expect(await sitzungen.pruefe(token)).toBeNull();
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
