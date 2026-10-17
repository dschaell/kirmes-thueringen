/**
 * Integrationstest gegen echtes PostgreSQL/PostGIS. Läuft nur mit DATABASE_URL
 * (lokal: `npm run db:up && npm run db:migrate`, in CI als Service-Container).
 */
import { PersistenzNichtVerfuegbar, type KalenderDatum, type TerminFilter } from '@kirmes/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  erzeugeToken,
  hashToken,
  PgBearbeitungslinks,
  PgFestplatzRepository,
} from '../src/infrastructure/postgres/festplatz-repository.js';
import { PgOrtRepository } from '../src/infrastructure/postgres/ort-repository.js';
import { VerwaltungMitGelesenemStand } from './verwaltung-mit-gelesenem-stand.js';
import { PgTerminVerwaltung } from '../src/infrastructure/postgres/termin-verwaltung.js';
import { erstellePool, istVerbindungsfehler } from '../src/infrastructure/postgres/pool.js';
import {
  alsLikeMuster,
  datenbankErreichbar,
  OrtNichtGefunden,
  PgTerminRepository,
} from '../src/infrastructure/postgres/termin-repository.js';
import { testDatenbankUrl } from './test-datenbank.js';

const url = testDatenbankUrl();
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
      "DELETE FROM termin WHERE ort_id IN (SELECT id FROM ort WHERE slug IN ('it-muehlberg', 'it-ulla'))",
    );
    await pool.query("DELETE FROM ort WHERE slug IN ('it-muehlberg', 'it-ulla')");
    await pool.query(
      `INSERT INTO ort (slug, name, landkreis, lage) VALUES
        ('it-muehlberg', 'IT-Mühlberg', 'GTH', ST_SetSRID(ST_MakePoint(10.82, 50.87), 4326)),
        ('it-ulla', 'IT-Ulla', 'WL', NULL)`,
    );
  });
  afterAll(async () => {
    await pool.query("DELETE FROM ort WHERE slug IN ('it-muehlberg', 'it-ulla')");
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
      kategorie: 'party',
      bestaetigt: true,
    });
    await repo.speichere({
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d('2026-05-09'),
      beginn: null,
      titel: 'ZZTEST Kindertanz',
      veranstaltungsort: null,
      kategorie: 'familie',
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

    const kat = await repo.suche({ ...basis, suchtext: 'ZZTEST', kategorien: ['familie'] });
    expect(kat.eintraege.map((t) => t.kategorie)).toEqual(['familie']);
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
        kategorie: 'party',
        bestaetigt: false,
      }),
    ).rejects.toBeInstanceOf(OrtNichtGefunden);
  });

  it('filtert nach Ort und liefert Ortsübersicht', async () => {
    const nurUlla = await repo.suche({ ...basis, ortSlug: 'it-ulla' });
    const einzeln = await repo.finde(nurUlla.eintraege[0]!.id);
    expect(einzeln?.titel).toBe('ZZTEST Kindertanz');
    expect(await repo.finde('00000000-0000-4000-8000-000000000000')).toBeNull();
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

  it('Bearbeitungslink: nur Hash gespeichert, gesperrte Links ungültig, Festplatz am Termin', async () => {
    const token = erzeugeToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO bearbeitungslink (ort_id, token_hash, bezeichnung)
       SELECT id, $1, 'IT-KG' FROM ort WHERE slug = 'it-ulla' RETURNING id::text`,
      [hashToken(token)],
    );
    const links = new PgBearbeitungslinks(pool);
    const b = await links.pruefe(token);
    expect(b).toEqual({
      linkId: rows[0]?.id,
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      bezeichnung: 'IT-KG',
    });
    expect(await links.pruefe(erzeugeToken())).toBeNull();
    expect(await links.pruefe("' OR 1=1 --")).toBeNull();

    const festplaetze = new PgFestplatzRepository(pool);
    await festplaetze.speichere('it-ulla', { name: '', koordinate: { lat: 50.95, lon: 11.2 } }, b!);
    const termine = await repo.suche({ ...basis, ortSlug: 'it-ulla' });
    expect(termine.eintraege[0]?.festplatz).toEqual({ lat: 50.95, lon: 11.2 });

    const u = await festplaetze.uebersicht('it-ulla');
    expect(u?.festplaetze).toEqual([{ name: '', koordinate: { lat: 50.95, lon: 11.2 } }]);
    expect(await festplaetze.loesche('it-ulla', '', b!)).toBe(true);
    expect(await festplaetze.loesche('it-ulla', '', b!)).toBe(false);
    const protokoll = await pool.query(
      'SELECT aktion FROM aenderungsprotokoll WHERE link_id = $1 ORDER BY id',
      [b!.linkId],
    );
    expect(protokoll.rows.map((r) => r.aktion)).toEqual([
      'festplatz_gespeichert',
      'festplatz_geloescht',
    ]);

    await pool.query('UPDATE bearbeitungslink SET gesperrt_am = now() WHERE id = $1', [b!.linkId]);
    expect(await links.pruefe(token)).toBeNull();
    expect(await festplaetze.uebersicht('it-gibtsnicht')).toBeNull();
  });

  it('Kirmesgesellschaft verwaltet nur Termine ihres Ortes – mit Protokoll', async () => {
    const link = await pool.query<{ id: string }>(
      `INSERT INTO bearbeitungslink (ort_id, token_hash, bezeichnung)
       SELECT id, $1, 'IT-KG Ulla' FROM ort WHERE slug = 'it-ulla' RETURNING id::text`,
      [hashToken(erzeugeToken())],
    );
    const durch = {
      linkId: link.rows[0]!.id,
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      bezeichnung: 'IT-KG Ulla',
    };
    const v = new VerwaltungMitGelesenemStand(pool);
    const neu = await v.lege(
      {
        ortSlug: 'it-ulla',
        landkreis: 'WL',
        datum: d('2026-10-03'),
        beginn: '20:00',
        titel: 'ZZTEST Neu',
        veranstaltungsort: 'Saal',
        kategorie: 'party',
        bestaetigt: true,
      },
      durch,
    );
    expect(neu.ort.name).toBe('IT-Ulla');
    expect(
      await v.aendere(
        neu.id,
        {
          ortSlug: 'it-ulla',
          landkreis: 'WL',
          datum: d('2026-10-04'),
          beginn: null,
          titel: 'ZZTEST Geändert',
          veranstaltungsort: null,
          kategorie: 'party',
          bestaetigt: true,
        },
        durch,
      ),
    ).toBe(true);

    // Termin aus Mühlberg ist für den Ulla-Link tabu
    const fremd = (await repo.suche({ ...basis, suchtext: 'ZZTEST', ortSlug: 'it-muehlberg' }))
      .eintraege[0]!;
    expect(await v.loesche(fremd.id, durch)).toBe(false);
    expect(await v.bestaetige(fremd.id, durch)).toBe(false);
    expect(await repo.finde(fremd.id)).not.toBeNull();

    expect(await v.bestaetige(neu.id, durch)).toBe(true);
    expect(await v.loesche(neu.id, durch)).toBe(true);
    const protokoll = await pool.query(
      'SELECT aktion FROM aenderungsprotokoll WHERE link_id = $1 ORDER BY id',
      [durch.linkId],
    );
    expect(protokoll.rows.map((r) => r.aktion)).toEqual([
      'termin_angelegt',
      'termin_geaendert',
      'termin_bestaetigt',
      'termin_geloescht',
    ]);
  });

  it('Bearbeiten: Termin und Mittagstisch in einer Transaktion, inklusive Rollback', async () => {
    const durch = { linkId: null, ortSlug: 'it-ulla', landkreis: 'WL', bezeichnung: 'IT' };
    const v = new VerwaltungMitGelesenemStand(pool);
    const eingabe: NeuerTermin = {
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d('2027-09-19'),
      beginn: '10:00',
      titel: 'ZZStift Frühschoppen',
      kategorie: 'tradition',
      bestaetigt: false,
      band: null,
      info: null,
      muttizettel: false,
      veranstaltungsort: null,
    };
    const t = await v.lege(eingabe, durch);
    expect(
      await v.aendere(
        t.id,
        { ...eingabe, titel: 'ZZStift geändert', speisen: [{ name: 'Klöße', preisCent: 950 }] },
        durch,
      ),
    ).toBe(true);
    expect(await repo.finde(t.id)).toMatchObject({
      titel: 'ZZStift geändert',
      speisen: [{ name: 'Klöße', preisCent: 950 }],
    });
    await expect(
      v.aendere(
        t.id,
        { ...eingabe, titel: 'ZZStift ungültig', speisen: [{ name: 'Klöße', preisCent: -1 }] },
        durch,
      ),
    ).rejects.toThrow();
    expect(await repo.finde(t.id)).toMatchObject({
      titel: 'ZZStift geändert',
      speisen: [{ name: 'Klöße', preisCent: 950 }],
    });
    expect(await v.aendere(t.id, { ...eingabe, speisen: [] }, { ...durch, ortSlug: 'fremd' })).toBe(
      false,
    );
    expect((await repo.finde(t.id))?.speisen).toHaveLength(1);
    expect(await v.aendere(t.id, { ...eingabe, speisen: [] }, durch)).toBe(true);
    expect((await repo.finde(t.id))?.speisen).toEqual([]);
    expect(await v.aendere(t.id, eingabe, durch)).toBe(true);
    await v.loesche(t.id, durch);
  });

  it('Mittagstisch: ersetzen, in Reihenfolge laden, nur im eigenen Ort (#66)', async () => {
    const durch = { linkId: null, ortSlug: 'it-ulla', landkreis: 'WL', bezeichnung: 'IT' };
    const v = new VerwaltungMitGelesenemStand(pool);
    const [t] = await v.legeAlle(
      [
        {
          ortSlug: 'it-ulla',
          landkreis: 'WL',
          datum: d('2026-10-25'),
          beginn: '10:00',
          speisen: [{ name: 'Klöße', preisCent: 950 }],
          titel: 'ZZMT Frühschoppen',
          veranstaltungsort: null,
          kategorie: 'tradition',
          bestaetigt: true,
          band: null,
          info: null,
          muttizettel: false,
        },
      ],
      durch,
    );
    const id = t!.id;
    expect((await repo.finde(id))?.speisen).toEqual([{ name: 'Klöße', preisCent: 950 }]);
    expect(
      await v.setzeSpeisen(
        id,
        [
          { name: 'Rostbrätel mit Brot', preisCent: 750 },
          { name: 'Kaffee und Kuchen', preisCent: null },
        ],
        durch,
      ),
    ).toBe(true);
    expect((await repo.finde(id))?.speisen).toEqual([
      { name: 'Rostbrätel mit Brot', preisCent: 750 },
      { name: 'Kaffee und Kuchen', preisCent: null },
    ]);
    // ersetzen statt anhängen
    expect(await v.setzeSpeisen(id, [{ name: 'Erbsensuppe', preisCent: 450 }], durch)).toBe(true);
    expect((await repo.finde(id))?.speisen).toEqual([{ name: 'Erbsensuppe', preisCent: 450 }]);
    // fremder Ort → nichts geändert
    expect(await v.setzeSpeisen(id, [], { ...durch, ortSlug: 'it-anderer-ort' })).toBe(false);
    expect((await repo.finde(id))?.speisen).toHaveLength(1);
    // leere Liste entfernt den Mittagstisch
    expect(await v.setzeSpeisen(id, [], durch)).toBe(true);
    expect((await repo.finde(id))?.speisen).toEqual([]);
    // Löschen des Termins nimmt den Mittagstisch mit (CASCADE)
    await v.loesche(id, durch);
    const rest = await pool.query(
      'SELECT count(*)::int AS n FROM termin_speise WHERE termin_id = $1',
      [id],
    );
    expect(rest.rows[0].n).toBe(0);
  });

  it('Ganze Kirmes bearbeiten: ändern und löschen in einer Transaktion (#65)', async () => {
    const durch = { linkId: null, ortSlug: 'it-ulla', landkreis: 'WL', bezeichnung: 'IT' };
    const t = (datum: string, titel: string) => ({
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d(datum),
      beginn: '20:00',
      titel,
      veranstaltungsort: null,
      kategorie: 'party' as const,
      bestaetigt: false,
      band: null,
      info: null,
      muttizettel: false,
    });
    const v = new VerwaltungMitGelesenemStand(pool);
    const [a, b] = await v.legeAlle(
      [t('2026-10-23', 'ZZSAM A'), t('2026-10-24', 'ZZSAM B')],
      durch,
    );
    const titel = async () =>
      (await repo.suche({ ...basis, suchtext: 'ZZSAM', ortSlug: 'it-ulla' })).eintraege
        .map((x) => x.titel)
        .sort();

    // ein fremder Termin in der Liste → nichts geändert, nichts gelöscht
    expect(
      await v.aendereAlle(
        [{ id: a!.id, termin: t('2026-10-23', 'ZZSAM A neu') }],
        ['99999999-9999-4999-8999-999999999999', b!.id],
        durch,
      ),
    ).toBe(false);
    expect(await titel()).toEqual(['ZZSAM A', 'ZZSAM B']);
    // Termin eines anderen Ortes zählt als fremd
    expect(
      await v.aendereAlle([{ id: a!.id, termin: t('2026-10-23', 'ZZSAM A neu') }], [], {
        ...durch,
        ortSlug: 'it-anderer-ort',
      }),
    ).toBe(false);

    expect(
      await v.aendereAlle([{ id: a!.id, termin: t('2026-10-23', 'ZZSAM A neu') }], [b!.id], durch),
    ).toBe(true);
    expect(await titel()).toEqual(['ZZSAM A neu']);
    // Datenbankfehler (keine UUID) werden nicht verschluckt – und rollen zurück
    await expect(
      v.aendereAlle([{ id: 'keine-uuid', termin: t('2026-10-23', 'X') }], [], durch),
    ).rejects.toThrow();
    expect(await titel()).toEqual(['ZZSAM A neu']);
    await v.loesche(a!.id, durch);
  });

  it('Kirmeswochenende: alle Abende mit Band und Hinweisen – oder gar keiner', async () => {
    const durch = {
      linkId: null,
      adminId: undefined,
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      bezeichnung: 'IT',
    };
    const abend = (
      datum: string,
      titel: string,
      band: string | null,
      info: string | null = null,
    ) => ({
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d(datum),
      beginn: '20:00',
      titel,
      veranstaltungsort: 'Saal',
      kategorie: 'party' as const,
      bestaetigt: true,
      band,
      info,
      muttizettel: band !== null,
    });
    const v = new VerwaltungMitGelesenemStand(pool);
    const angelegt = await v.legeAlle(
      [
        abend('2026-10-16', 'ZZWE Disco', 'DJ Wirbelwind'),
        abend('2026-10-17', 'ZZWE Tanz', 'Belconda', 'Eintritt 8 €'),
      ],
      durch,
    );
    expect(angelegt.map((t) => t.ort.name)).toEqual(['IT-Ulla', 'IT-Ulla']);
    const gefunden = await repo.suche({ ...basis, suchtext: 'Belconda', ortSlug: 'it-ulla' });
    expect(gefunden.eintraege.map((t) => [t.titel, t.band, t.info, t.muttizettel])).toEqual([
      ['ZZWE Tanz', 'Belconda', 'Eintritt 8 €', true],
    ]);

    // zweiter Abend scheitert (unbekannter Ort) → auch der erste wird nicht gespeichert
    await expect(
      v.legeAlle(
        [
          abend('2026-10-18', 'ZZWE Frühschoppen', null),
          { ...abend('2026-10-18', 'x', null), ortSlug: 'it-gibtsnicht' },
        ],
        durch,
      ),
    ).rejects.toThrow('nicht gefunden');
    expect((await repo.suche({ ...basis, suchtext: 'ZZWE Frühschoppen' })).gesamt).toBe(0);
  });

  it('reicht SQL-Fehler unverändert durch (nur Verbindungsfehler werden übersetzt)', async () => {
    const { abfrage } = await import('../src/infrastructure/postgres/pool.js');
    await expect(abfrage(pool, 'SELECT * FROM gibt_es_nicht', [])).rejects.toMatchObject({
      code: '42P01',
    });
  });

  it('Transaktionen: unbekannter Ort bricht ab und hinterlässt nichts', async () => {
    const durch = {
      linkId: null,
      adminId: undefined,
      ortSlug: 'it-gibtsnicht',
      landkreis: 'GTH',
      bezeichnung: 'IT',
    };
    const vorher = await pool.query(
      'SELECT count(*)::int AS n FROM aenderungsprotokoll WHERE link_id IS NULL AND admin_id IS NULL',
    );
    await expect(
      new PgFestplatzRepository(pool).speichere(
        'it-gibtsnicht',
        { name: '', koordinate: { lat: 50.9, lon: 11 } },
        durch,
      ),
    ).rejects.toThrow('nicht gefunden');
    await expect(
      new PgTerminVerwaltung(pool).lege(
        {
          ortSlug: 'it-gibtsnicht',
          landkreis: 'GTH',
          datum: d('2026-10-18'),
          beginn: null,
          titel: 'x',
          veranstaltungsort: null,
          kategorie: 'party',
          bestaetigt: false,
        },
        durch,
      ),
    ).rejects.toThrow('nicht gefunden');
    expect(
      await new PgTerminVerwaltung(pool).aendere(
        '00000000-0000-4000-8000-000000000000',
        {
          ortSlug: 'it-ulla',
          landkreis: 'WL',
          datum: d('2026-10-18'),
          beginn: null,
          titel: 'x',
          veranstaltungsort: null,
          kategorie: 'party',
          bestaetigt: false,
        },
        { ...durch, ortSlug: 'it-ulla' },
      ),
    ).toBe(false);
    const nachher = await pool.query(
      'SELECT count(*)::int AS n FROM aenderungsprotokoll WHERE link_id IS NULL AND admin_id IS NULL',
    );
    expect(nachher.rows[0].n).toBe(vorher.rows[0].n);
  });

  it('LegeTerminAn-Pfad: Repository speichert und liefert den Termin zurück', async () => {
    const t = await repo.speichere({
      ortSlug: 'it-ulla',
      landkreis: 'WL',
      datum: d('2026-12-05'),
      beginn: '18:00',
      titel: 'ZZTEST Weihnachtstanz',
      veranstaltungsort: 'Saal',
      kategorie: 'party',
      bestaetigt: false,
    });
    expect(t).toMatchObject({
      ort: { slug: 'it-ulla', name: 'IT-Ulla' },
      titel: 'ZZTEST Weihnachtstanz',
      festplatz: null,
    });
    expect((await repo.finde(t.id))?.beginn).toBe('18:00');
  });

  it('Kartenausschnitt: nur Orte im Rechteck (GiST-Index)', async () => {
    const { PgOrtRepository } = await import('../src/infrastructure/postgres/ort-repository.js');
    const orte = new PgOrtRepository(pool);
    const rund = { minLon: 10.7, minLat: 50.8, maxLon: 10.9, maxLat: 50.95 };
    const drin = await orte.liste(d('2026-01-01'), rund);
    expect(drin.map((o) => o.ort.slug)).toContain('it-muehlberg');
    expect(drin.map((o) => o.ort.slug)).not.toContain('it-ulla'); // ohne Koordinate
    const fern = await orte.liste(d('2026-01-01'), {
      minLon: 12,
      minLat: 50.2,
      maxLon: 12.1,
      maxLat: 50.3,
    });
    expect(fern.map((o) => o.ort.slug)).not.toContain('it-muehlberg');
  });

  it('Festplatz-Übersicht nennt die Veranstaltungsorte aus den Terminen', async () => {
    const u = await new PgFestplatzRepository(pool).uebersicht('it-muehlberg');
    expect(u?.veranstaltungsorte).toContain('Reitstall');
    expect(u?.ort.koordinate).toEqual({ lat: 50.87, lon: 10.82 });
  });
});
