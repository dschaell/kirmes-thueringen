/** Schutzzweige der Repositories ohne Datenbank: Treiber liefert keine Zeilen / kein rowCount. */
import { describe, expect, it } from 'vitest';
import {
  PgEinladungen,
  PgKontoAnlage,
  PgMitglieder,
  PgMitteilungen,
  PgLinkVerwaltung,
  PgOrtVerwaltung,
} from '../src/infrastructure/postgres/admin-repository.js';
import { PgPasskeys } from '../src/infrastructure/postgres/passkey-repository.js';

const leer = {
  query: async () => ({ rows: [], rowCount: null }),
  connect: async () => ({ query: async () => ({ rows: [], rowCount: null }), release: () => {} }),
};
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

it('verweigert die Entfernung eines Admins bei fehlendem Zählergebnis', async () => {
  const { LetzterAdmin } = await import('@kirmes/core');
  const c = {
    query: async (sql: string) => ({
      rows: sql.startsWith('SELECT rolle') ? [{ rolle: 'admin' }] : [],
      rowCount: 0,
    }),
    release: () => {},
  };
  const m = new PgMitglieder({ connect: async () => c } as never);
  await expect(m.entferne('1')).rejects.toBeInstanceOf(LetzterAdmin);
});

it('meldet fehlende Mitteilungen und Links statt Erfolg ohne Ergebnis', async () => {
  const m = new PgMitteilungen(leer as never);
  expect(await m.aktuelle()).toBeNull();
  await expect(m.lege({ titel: 'Prüfung', text: 'Text', link: null }, '1')).rejects.toThrow(
    'nicht gespeichert',
  );
  expect(await m.setzeVeroeffentlicht('1', true)).toBe(false);
  expect(await m.loesche('1')).toBe(false);
  expect(await new PgLinkVerwaltung(leer as never).sperre('1')).toBe(false);
});

it.each(['UPDATE', 'DELETE'])(
  'meldet keine erfolgreiche Sammeländerung, wenn %s keine Zeile schreibt',
  async (befehl) => {
    const { PgTerminVerwaltung } =
      await import('../src/infrastructure/postgres/termin-verwaltung.js');
    const protokoll: string[] = [];
    const c = {
      query: async (sql: string) => {
        const art = sql.trim().split(/\s+/)[0] ?? '';
        protokoll.push(art);
        return { rows: art === 'SELECT' ? [{ version: '1', ort_id: '1' }] : [], rowCount: 0 };
      },
      release: () => {},
    };
    const v = new PgTerminVerwaltung({ connect: async () => c } as never);
    const durch = { linkId: null, ortSlug: 'test', landkreis: 'IK', bezeichnung: 'Test' };
    const termin = {
      version: '1',
      ortSlug: 'test',
      landkreis: 'IK',
      datum: '2027-09-16',
      titel: 'Test',
      beginn: null,
      veranstaltungsort: null,
      kategorie: 'party',
      bestaetigt: false,
      band: null,
      info: null,
      muttizettel: false,
    } as const;
    const r = await v.aendereAlle(
      befehl === 'UPDATE' ? [{ id: 'id', termin: termin as never }] : [],
      befehl === 'DELETE' ? ['id'] : [],
      durch,
      { id: '1' },
    );
    expect(r).toBe(false);
    expect(protokoll).toContain('ROLLBACK');
    expect(protokoll).not.toContain('COMMIT');
  },
);

describe('Ort löschen bei Datenbankfehler (Issue #159)', () => {
  it('rollt zurück, gibt die Verbindung frei und meldet den Fehler weiter', async () => {
    const abfragen: string[] = [];
    let freigegeben = false;
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          abfragen.push(sql.trim().split(/\s+/)[0] ?? '');
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'ROLLBACK') throw new Error('Verbindung weg');
          throw new Error('kaputt');
        },
        release: () => {
          freigegeben = true;
        },
      }),
    };
    await expect(new PgOrtVerwaltung(pool as never).loesche('x', '1')).rejects.toThrow('kaputt');
    expect(abfragen).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(freigegeben).toBe(true);
  });
});
