import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { type KalenderDatum, type NeuerTermin, TerminKonflikt, LetzterAdmin } from '@kirmes/core';
import { PgTerminVerwaltung } from '../src/infrastructure/postgres/termin-verwaltung.js';
import { PgTerminRepository } from '../src/infrastructure/postgres/termin-repository.js';
import { PgMitglieder } from '../src/infrastructure/postgres/admin-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';
const url = testDatenbankUrl();
describe.runIf(url)('Datenkonflikte und unveränderte Originale (#85)', () => {
  const db = new pg.Pool({ connectionString: url });
  const v = new PgTerminVerwaltung(db);
  const repo = new PgTerminRepository(db);
  const durch = { linkId: null, ortSlug: 'it-konflikte', landkreis: 'IK', bezeichnung: 'Test' };
  const t = (titel: string): NeuerTermin => ({
    ortSlug: durch.ortSlug,
    landkreis: 'IK',
    datum: '2027-09-16' as KalenderDatum,
    beginn: '20:00',
    titel,
    veranstaltungsort: null,
    kategorie: 'party',
    bestaetigt: true,
    band: 'Originalband',
    info: 'Originalhinweis',
    muttizettel: false,
  });
  beforeAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-konflikte'");
    await db.query(
      "INSERT INTO ort(slug,name,landkreis) VALUES ('it-konflikte','IT Konflikte','IK')",
    );
  });
  afterAll(async () => {
    await db.query("DELETE FROM ort WHERE slug = 'it-konflikte'");
    await db.end();
  });
  it('Neuanlage und Umbenennung auf Dublette erhalten Daten und Protokoll', async () => {
    const a = await v.lege(t('IT Original'), durch);
    await expect(
      v.lege({ ...t('IT Original'), band: null, info: null }, durch),
    ).rejects.toBeInstanceOf(TerminKonflikt);
    expect(await repo.finde(a.id)).toMatchObject({
      band: 'Originalband',
      info: 'Originalhinweis',
      version: a.version,
    });
    await expect(
      v.legeAlle([t('IT Nicht teilweise speichern'), t('IT Original')], durch),
    ).rejects.toThrow('bereits');
    const teilweise = await db.query(
      "SELECT count(*)::int AS n FROM termin WHERE titel = 'IT Nicht teilweise speichern'",
    );
    expect(teilweise.rows[0].n).toBe(0);
    const b = await v.lege(t('IT Zweiter'), durch);
    await expect(
      v.aendere(b.id, { ...t('IT Original'), version: b.version }, durch),
    ).rejects.toThrow('bereits');
    expect((await repo.finde(b.id))?.titel).toBe('IT Zweiter');
    const audit = await db.query(
      "SELECT count(*)::int AS n FROM aenderungsprotokoll WHERE details->>'id'=$1",
      [a.id],
    );
    expect(audit.rows[0].n).toBe(1);
  });
  it('nur eine parallele Bearbeitung gewinnt; Speisen und fehlende Version sind geschützt', async () => {
    const a = await v.lege(t('IT Parallel'), durch);
    const ergebnisse = await Promise.allSettled([
      v.aendere(a.id, { ...t('IT Parallel'), band: 'Band A', version: a.version }, durch),
      v.aendere(a.id, { ...t('IT Parallel'), info: 'Hinweis B', version: a.version }, durch),
    ]);
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.status === 'rejected')).toHaveLength(1);
    await expect(v.aendere(a.id, t('IT Parallel'), durch)).rejects.toThrow('inzwischen');
    await expect(v.loesche(a.id, durch, a.version)).rejects.toThrow('inzwischen');
    const frisch = await repo.finde(a.id);
    expect(
      await v.setzeSpeisen(a.id, [{ name: 'Klöße', preisCent: 900 }], durch, frisch?.version),
    ).toBe(true);
    await expect(
      v.aendere(a.id, { ...t('IT Parallel'), version: frisch?.version }, durch),
    ).rejects.toThrow('inzwischen');
    expect((await repo.finde(a.id))?.speisen).toEqual([{ name: 'Klöße', preisCent: 900 }]);
  });
  it('Sammeländerung mit veralteter Löschung rollt sämtliche Änderungen zurück', async () => {
    const a = await v.lege(t('IT Sammel A'), durch);
    const b = await v.lege(t('IT Sammel B'), durch);
    await v.bestaetige(b.id, durch, b.version);
    await expect(
      v.aendereAlle(
        [{ id: a.id, termin: { ...t('IT Sammel A neu'), version: a.version } }],
        [b.id],
        durch,
        { [b.id]: b.version ?? '' },
      ),
    ).rejects.toThrow('inzwischen');
    expect((await repo.finde(a.id))?.titel).toBe('IT Sammel A');
    expect(await repo.finde(b.id)).not.toBeNull();
    const aktuell = await repo.finde(b.id);
    expect(await v.loesche(b.id, durch, aktuell?.version)).toBe(true);
  });
});

describe.runIf(url)('Letzter Admin unter Parallelität (#85)', () => {
  // Eigener Namensraum verhindert Wechselwirkungen mit parallelen Konten-Integrationstests.
  const db = new pg.Pool({
    connectionString: url,
    options: '-c search_path=it_adminschutz,public',
  });
  const m = new PgMitglieder(db);
  beforeAll(async () => {
    await db.query('CREATE SCHEMA IF NOT EXISTS it_adminschutz');
    await db.query(
      'CREATE TABLE it_adminschutz.admin(id bigint PRIMARY KEY, name text, rolle text)',
    );
  });
  afterAll(async () => {
    await db.query('DROP SCHEMA it_adminschutz CASCADE');
    await db.end();
  });
  for (const art of ['herabstufen', 'entfernen', 'gemischt']) {
    it(`${art}: genau ein Admin bleibt`, async () => {
      await db.query('DELETE FROM it_adminschutz.admin');
      await db.query("INSERT INTO it_adminschutz.admin VALUES (1,'A','admin'),(2,'B','admin')");
      const ergebnis = await Promise.allSettled([
        art === 'entfernen' ? m.entferne('1') : m.setzeRolle('1', 'redaktion'),
        art === 'herabstufen' ? m.setzeRolle('2', 'redaktion') : m.entferne('2'),
      ]);
      expect(ergebnis.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
      expect(ergebnis.find((e) => e.status === 'rejected')).toMatchObject({
        reason: expect.any(LetzterAdmin),
      });
      expect(await m.anzahlAdmins()).toBe(1);
    });
  }
});
