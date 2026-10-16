/** Schutzzweige der Repositories ohne Datenbank: Treiber liefert keine Zeilen / kein rowCount. */
import { describe, expect, it } from 'vitest';
import {
  PgEinladungen,
  PgKontoAnlage,
  PgMitglieder,
} from '../src/infrastructure/postgres/admin-repository.js';
import { PgPasskeys } from '../src/infrastructure/postgres/passkey-repository.js';

const leer = { query: async () => ({ rows: [], rowCount: null }) };
const schluessel = {
  credentialId: 'it-ABCDEFGHIJKLMNOP',
  publicKey: new Uint8Array([1]),
  zaehler: 0,
  transports: [],
};

describe('Repositories ohne Ergebniszeilen', () => {
  it('zählen 0 bzw. melden „nicht gefunden“ statt abzustürzen', async () => {
    const m = new PgMitglieder(leer as never);
    expect(await m.setzeRolle('1', 'admin')).toBe(false);
    expect(await m.entferne('1')).toBe(false);
    expect(await m.anzahlAdmins()).toBe(0);
    const e = new PgEinladungen(leer as never);
    expect(await e.widerrufe('1')).toBe(false);
    await expect(e.lege('T'.repeat(43), 'admin', null, 7)).rejects.toThrow('keine Einladung');
    const p = new PgPasskeys(leer as never);
    expect(await p.konto('1')).toBeNull();
    expect(await p.loesche('1', '1')).toBe(false);
    await expect(p.lege({ adminId: '1', ...schluessel, name: 'x' })).rejects.toThrow(
      'keinen Passkey',
    );
  });

  it('Kontoanlage: kein Konto zurück → Fehler und ROLLBACK', async () => {
    const befehle: string[] = [];
    const client = {
      query: async (sql: string) => {
        befehle.push(sql.trim().split(/\s+/)[0]!);
        return { rows: sql.startsWith('UPDATE einladung') ? [{ id: '1' }] : [] };
      },
      release: () => befehle.push('release'),
    };
    const a = new PgKontoAnlage({ connect: async () => client } as never);
    await expect(
      a.lege({ name: 'X', rolle: 'redaktion', kennung: 'k' }, schluessel, 'x', {
        art: 'einladung',
        einladungId: '1',
      }),
    ).rejects.toThrow('kein Konto');
    expect(befehle).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'ROLLBACK', 'release']);
  });
});

it('Vorschlag ohne zurückgegebene ID wird vollständig zurückgerollt', async () => {
  const { PgVorschlaege } = await import('../src/infrastructure/postgres/vorschlags-repository.js');
  const befehle: string[] = [];
  const client = {
    query: async (sql: string) => {
      befehle.push(sql.trim().split(/\s+/)[0] ?? '');
      return {
        rows: sql.startsWith('SELECT id FROM ort')
          ? [{ id: '1' }]
          : sql.includes('count(*)')
            ? [{ n: 0 }]
            : [],
      };
    },
    release: () => befehle.push('release'),
  };
  const repo = new PgVorschlaege({ connect: async () => client } as never);
  await expect(
    repo.lege({
      ortSlug: 'test',
      kontaktName: null,
      kontaktEmail: null,
      nachricht: null,
      termine: [],
    }),
  ).rejects.toThrow('Vorschlag konnte nicht angelegt werden');
  expect(befehle).toEqual(['BEGIN', 'SELECT', 'SELECT', 'INSERT', 'ROLLBACK', 'release']);
});
