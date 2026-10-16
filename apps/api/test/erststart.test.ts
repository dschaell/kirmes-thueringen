/** Erststart ohne Server-Shell (Issue #42): Konfiguration und Ortsverzeichnis ohne Datenbank. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hashePasswort,
  neuesTotpGeheimnis,
  NodeKryptografie,
} from '../src/infrastructure/krypto.js';
import {
  hashFuerEnv,
  ladeAdminStart,
  ladeOrte,
  legeErstenAdminAn,
  leseOrtsverzeichnis,
  sollOrteLaden,
} from '../src/infrastructure/postgres/erststart.js';

describe('ladeAdminStart', () => {
  const gueltig = async () => ({
    ADMIN_EMAIL: ' Redaktion@Example.org ',
    ADMIN_PASSWORT_HASH: hashFuerEnv(await hashePasswort('ein-langes-passwort')),
    ADMIN_TOTP_GEHEIMNIS: neuesTotpGeheimnis().toLowerCase(),
  });

  it('ohne Variablen: kein Erststart-Admin', () => {
    expect(ladeAdminStart({})).toBeNull();
    expect(ladeAdminStart({ ADMIN_EMAIL: '  ' })).toBeNull();
  });

  it('liefert normalisierte Werte und den ursprünglichen scrypt-Hash', async () => {
    const env = await gueltig();
    const a = ladeAdminStart(env);
    expect(a?.email).toBe('redaktion@example.org');
    expect(a?.totpGeheimnis).toBe(env.ADMIN_TOTP_GEHEIMNIS.toUpperCase());
    expect(a?.passwortHash.startsWith('scrypt$')).toBe(true);
    // Der zurückübersetzte Hash prüft das Passwort wie beim normalen Anlegen
    const k = new NodeKryptografie();
    expect(await k.pruefePasswort('ein-langes-passwort', a!.passwortHash)).toBe(true);
    expect(await k.pruefePasswort('falsch-falsch-falsch', a!.passwortHash)).toBe(false);
  });

  it('der Hash für .env enthält kein „$“ (Docker Compose würde es als Variable deuten)', async () => {
    expect((await gueltig()).ADMIN_PASSWORT_HASH).not.toContain('$');
  });

  it('nur ein Teil gesetzt → Abbruch statt halbem Zugang', async () => {
    const env = await gueltig();
    expect(() => ladeAdminStart({ ADMIN_EMAIL: env.ADMIN_EMAIL })).toThrow('nur gemeinsam');
    expect(() => ladeAdminStart({ ...env, ADMIN_TOTP_GEHEIMNIS: '' })).toThrow('nur gemeinsam');
  });

  it('weist ungültige Werte zurück', async () => {
    const env = await gueltig();
    expect(() => ladeAdminStart({ ...env, ADMIN_EMAIL: 'keine-mail' })).toThrow('ADMIN_EMAIL');
    // Klartext-Passwort statt Hash wird nicht angenommen
    expect(() => ladeAdminStart({ ...env, ADMIN_PASSWORT_HASH: 'geheim123456' })).toThrow(
      'ADMIN_PASSWORT_HASH',
    );
    // Hash mit „$“ (nicht für .env kodiert) ebenfalls nicht
    expect(() =>
      ladeAdminStart({ ...env, ADMIN_PASSWORT_HASH: env.ADMIN_PASSWORT_HASH.replaceAll(':', '$') }),
    ).toThrow('ADMIN_PASSWORT_HASH');
    expect(() => ladeAdminStart({ ...env, ADMIN_TOTP_GEHEIMNIS: '0189' })).toThrow(
      'ADMIN_TOTP_GEHEIMNIS',
    );
  });
});

describe('sollOrteLaden', () => {
  it('nur bei ausdrücklichem ORTE_LADEN=ja', () => {
    expect(sollOrteLaden({ ORTE_LADEN: 'ja' })).toBe(true);
    expect(sollOrteLaden({ ORTE_LADEN: ' JA ' })).toBe(true);
    expect(sollOrteLaden({ ORTE_LADEN: 'nein' })).toBe(false);
    expect(sollOrteLaden({})).toBe(false);
  });
});

describe('leseOrtsverzeichnis', () => {
  it('liest das mitgelieferte Verzeichnis', async () => {
    const { orte, verworfen } = await leseOrtsverzeichnis();
    expect(orte.length).toBeGreaterThan(3000);
    expect(verworfen).toBe(0);
  });

  it('verwirft Koordinaten außerhalb Thüringens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orte-'));
    try {
      const datei = join(dir, 'orte.json');
      await writeFile(
        datei,
        JSON.stringify([
          { slug: 'gotha', name: 'Gotha', landkreis: 'GTH', lat: 50.95, lon: 10.7 },
          { slug: 'berlin', name: 'Berlin', landkreis: 'GTH', lat: 52.52, lon: 13.4 },
        ]),
      );
      const { orte, verworfen } = await leseOrtsverzeichnis(pathToFileURL(datei));
      expect(orte.map((o) => o.slug)).toEqual(['gotha']);
      expect(verworfen).toBe(1);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe('ohne rowCount (Treiber liefert null)', () => {
  const db = { query: async () => ({ rows: [], rowCount: null }) };
  it('zählt 0 statt abzustürzen', async () => {
    expect(await ladeOrte(db as never, [])).toBe(0);
    expect(
      await legeErstenAdminAn(db as never, {
        email: 'a@b.de',
        passwortHash: 'scrypt$1$1$1$a$b',
        totpGeheimnis: 'JBSWY3DPEHPK3PXP',
      }),
    ).toBe(false);
  });
});
