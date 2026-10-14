/**
 * Integrationstest gegen echtes PostgreSQL/PostGIS. Läuft nur mit DATABASE_URL
 * (lokal: `npm run db:up && npm run db:migrate`, in CI als Service-Container).
 */
import { PersistenzNichtVerfuegbar, type KalenderDatum, type TerminFilter } from '@kirmes/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgOrtRepository } from '../src/infrastructure/postgres/ort-repository.js';
import { erstellePool, istVerbindungsfehler } from '../src/infrastructure/postgres/pool.js';
import {
  alsLikeMuster,
  datenbankErreichbar,
  OrtNichtGefunden,
  PgTerminRepository,
} from '../src/infrastructure/postgres/termin-repository.js';

const url = process.env.DATABASE_URL;
const d = (s: string) => s as KalenderDatum;
const basis: TerminFilter = {
  bereich: { von: d('2026-01-01'), bis: d('2026-12-31') },
  landkreise: [],
  kategorien: [],
  suchtext: null,
  ortSlug: null,
  nurBestaetigt: false,
  limit: 50,
  offset: 0,
};

describe('alsLikeMuster', () => {
  it('escaped LIKE-Metazeichen', () => {
    expect(alsLikeMuster('100%_\\')).toBe('%100\\%\\_\\\\%');
  });
});

describe('istVerbindungsfehler', () => {
  it('erkennt Verbindungs-, aber keine SQL-Fehler', () => {
    expect(istVerbindungsfehler(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(
      true,
    );
    expect(istVerbindungsfehler(Object.assign(new Error('x'), { code: '08006' }))).toBe(true);
    expect(istVerbindungsfehler(Object.assign(new Error('x'), { code: '23505' }))).toBe(false);
    expect(istVerbindungsfehler('kein Error')).toBe(false);
  });
});

describe('Datenbank nicht erreichbar', () => {
  it('meldet PersistenzNichtVerfuegbar statt Treiberfehler', async () => {
    const pool = erstellePool({
      connectionString: 'postgres://x:y@127.0.0.1:1/nix',
      ssl: false,
      maxVerbindungen: 1,
      statementTimeoutMs: 500,
    });
    await expect(new PgTerminRepository(pool).suche(basis)).rejects.toBeInstanceOf(
      PersistenzNichtVerfuegbar,
    );
    expect(await datenbankErreichbar(pool)).toBe(false);
    await pool.end();
  });
});

describe.runIf(url)('PgTerminRepository (PostgreSQL)', () => {
  const pool = erstellePool({
    connectionString: url ?? '',
    ssl: false,
    maxVerbindungen: 2,
    statementTimeoutMs: 5_000,
  });
  const repo = new PgTerminRepository(pool);

  beforeAll(async () => {
    await pool.query(
      "DELETE FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug LIKE 'it-%')",
    );
    await pool.query("DELETE FROM ort WHERE slug LIKE 'it-%'");
    await pool.query(
      `INSERT INTO ort (slug, name, landkreis, lage) VALUES
        ('it-muehlberg', 'IT-Mühlberg', 'GTH', ST_SetSRID(ST_MakePoint(10.82, 50.87), 4326)),
        ('it-ulla', 'IT-Ulla', 'WL', NULL)`,
    );
  });
  afterAll(async () => {
    await pool.query("DELETE FROM ort WHERE slug LIKE 'it-%'");
    await pool.end();
  });

  it('speichert und findet Termine mit Geodaten', async () => {
    await repo.speichere({
      ortSlug: 'it-muehlberg',
      landkreis: 'GTH',
      datum: d('2026-10-18'),
      beginn: '20:00',
      titel: 'ZZTEST Kirmestanz 100%',
      veranstaltungsort: 'Reitstall',
      kategorie: 'kirmes',
      bestaetigt: true,
    });
    await repo.speichere({
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d('2026-05-09'),
      beginn: null,
      titel: 'ZZTEST Kindertanz',
      veranstaltungsort: null,
      kategorie: 'kinder',
      bestaetigt: false,
    });

    const alle = await repo.suche({ ...basis, suchtext: 'ZZTEST' });
    expect(alle.gesamt).toBe(2);
    expect(alle.eintraege.map((t) => t.titel)).toEqual([
      'ZZTEST Kindertanz',
      'ZZTEST Kirmestanz 100%',
    ]);
    expect(alle.eintraege[1]?.ort.koordinate).toEqual({ lat: 50.87, lon: 10.82 });
    expect(alle.eintraege[1]?.beginn).toBe('20:00');

    const gth = await repo.suche({
      ...basis,
      suchtext: 'ZZTEST',
      landkreise: ['GTH'],
      nurBestaetigt: true,
    });
    expect(gth.eintraege.map((t) => t.ort.slug)).toEqual(['it-muehlberg']);

    const kat = await repo.suche({ ...basis, suchtext: 'ZZTEST', kategorien: ['kinder'] });
    expect(kat.eintraege.map((t) => t.kategorie)).toEqual(['kinder']);
  });

  it('behandelt Sonderzeichen in der Suche wörtlich (kein Wildcard, keine Injection)', async () => {
    expect((await repo.suche({ ...basis, suchtext: 'ZZTEST Kirmestanz 100%' })).gesamt).toBe(1);
    expect(
      (await repo.suche({ ...basis, suchtext: '%' })).eintraege.every((t) => t.titel.includes('%')),
    ).toBe(true);
    expect((await repo.suche({ ...basis, suchtext: "' OR 1=1 --" })).gesamt).toBe(0);
  });

  it('wirft OrtNichtGefunden für unbekannte Orte', async () => {
    await expect(
      repo.speichere({
        ortSlug: 'it-gibtsnicht',
        landkreis: 'GTH',
        datum: d('2026-10-18'),
        beginn: null,
        titel: 'x',
        veranstaltungsort: null,
        kategorie: 'kirmes',
        bestaetigt: false,
      }),
    ).rejects.toBeInstanceOf(OrtNichtGefunden);
  });

  it('filtert nach Ort und liefert Ortsübersicht', async () => {
    const nurUlla = await repo.suche({ ...basis, ortSlug: 'it-ulla' });
    expect(nurUlla.eintraege.map((t) => t.ort.slug)).toEqual(['it-ulla']);

    const orte = new PgOrtRepository(pool);
    const muehlberg = (await orte.liste(d('2026-10-01'))).find(
      (o) => o.ort.slug === 'it-muehlberg',
    );
    expect(muehlberg).toEqual({
      ort: {
        slug: 'it-muehlberg',
        name: 'IT-Mühlberg',
        landkreis: 'GTH',
        koordinate: { lat: 50.87, lon: 10.82 },
      },
      anzahlKommend: 1,
    });
    expect((await orte.finde('it-ulla'))?.koordinate).toBeNull();
    expect(await orte.finde('it-gibtsnicht')).toBeNull();
  });
});
