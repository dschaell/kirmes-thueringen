import {
  FindeOrt,
  ListeOrte,
  PersistenzNichtVerfuegbar,
  FindeTermin,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
  type TerminVerwaltung,
  type FestplatzRepository,
  type OrtRepository,
  type KalenderDatum,
  type Termin,
  type TerminFilter,
  type TerminRepository,
} from '@kirmes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { baueApp, istInternesNetz } from '../src/interfaces/http/app.js';

const termin: Termin = {
  id: '6f1c0b6e-3d2a-4c1b-9f00-0123456789ab',
  ort: { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'GTH', koordinate: null },
  datum: '2026-10-18' as KalenderDatum,
  beginn: '20:00',
  titel: 'Kirmestanz',
  veranstaltungsort: 'Reitstall',
  kategorie: 'kirmes',
  bestaetigt: true,
  festplatz: { lat: 50.87, lon: 10.82 },
};

class FakeRepo implements TerminRepository {
  filter: TerminFilter | null = null;
  fehler: Error | null = null;
  async suche(f: TerminFilter) {
    if (this.fehler) throw this.fehler;
    this.filter = f;
    return { eintraege: [termin], gesamt: 1 };
  }
  async finde(id: string) {
    return id === termin.id ? termin : null;
  }
  async speichere(): Promise<Termin> {
    throw new Error('nicht benötigt');
  }
}

const uhr = { heute: () => '2026-10-14' as KalenderDatum };
const ortRepo: OrtRepository = {
  liste: async () => [{ ort: termin.ort, anzahlKommend: 3 }],
  finde: async (slug) => (slug === 'muehlberg' ? termin.ort : null),
};

const TOKEN = 'A'.repeat(43);
const festplatzRepo: FestplatzRepository & { gespeichert: unknown[] } = {
  gespeichert: [],
  uebersicht: async () => ({ ort: termin.ort, festplaetze: [], veranstaltungsorte: ['Reitstall'] }),
  speichere: async (_o, f) => {
    festplatzRepo.gespeichert.push(f);
  },
  loesche: async (_o, name) => name === 'Reitstall',
};
const verwalte = new VerwalteFestplaetze(
  {
    pruefe: async (t) =>
      t === TOKEN
        ? { linkId: '1', ortSlug: 'muehlberg', landkreis: 'GTH', bezeichnung: 'KG Mühlberg' }
        : null,
  },
  festplatzRepo,
);

const geaendert: string[] = [];
const terminVerwaltung: TerminVerwaltung = {
  lege: async (t) => ({ ...termin, titel: t.titel, datum: t.datum }),
  aendere: async (id) => (geaendert.push(`aendere:${id}`), id === termin.id),
  bestaetige: async (id) => id === termin.id,
  loesche: async (id) => id === termin.id,
};

let app: Awaited<ReturnType<typeof baueApp>>;
async function setup(repo = new FakeRepo(), dbOk = true) {
  app = await baueApp({
    sucheTermine: new SucheTermine(repo, uhr),
    listeOrte: new ListeOrte(ortRepo, uhr),
    findeOrt: new FindeOrt(ortRepo),
    findeTermin: new FindeTermin(repo),
    verwalteFestplaetze: verwalte,
    verwalteTermine: new VerwalteTermine(
      {
        pruefe: async (t) =>
          t === TOKEN
            ? { linkId: '1', ortSlug: 'muehlberg', landkreis: 'GTH', bezeichnung: 'KG Mühlberg' }
            : null,
      },
      terminVerwaltung,
      repo,
      uhr,
    ),
    datenbankErreichbar: async () => dbOk,
  });
  return repo;
}
afterEach(() => app?.close());

describe('GET /api/v1/termine', () => {
  it('liefert Termine und übersetzt Query-Parameter in den Filter', async () => {
    const repo = await setup();
    const res = await app.inject(
      '/api/v1/termine?landkreis=gth,IK&kategorie=kinder&kategorie=kirmes&q=M%C3%BChlberg&bestaetigt=true&limit=5',
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gesamt: 1, termine: [{ titel: 'Kirmestanz' }] });
    expect(repo.filter).toMatchObject({
      landkreise: ['GTH', 'IK'],
      kategorien: ['kinder', 'kirmes'],
      suchtext: 'Mühlberg',
      nurBestaetigt: true,
      limit: 5,
    });
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('antwortet 400 mit Problem Details bei fachlich ungültigen Filtern', async () => {
    await setup();
    const res = await app.inject('/api/v1/termine?von=2026-12-01&bis=2026-01-01&landkreis=BY');
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json().fehler.map((f: { code: string }) => f.code)).toEqual([
      'BEREICH_UMGEKEHRT',
      'LANDKREIS_UNBEKANNT',
    ]);
  });

  it('antwortet 400 bei unbekannten Parametern (Schema)', async () => {
    await setup();
    const res = await app.inject('/api/v1/termine?sort=1;DROP TABLE termin');
    expect(res.statusCode).toBe(400);
  });

  it('antwortet 503 + Retry-After, wenn die Datenbank ausfällt', async () => {
    const repo = new FakeRepo();
    repo.fehler = new PersistenzNichtVerfuegbar();
    await setup(repo);
    const res = await app.inject('/api/v1/termine');
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
  });

  it('verrät bei unerwarteten Fehlern keine Interna', async () => {
    const repo = new FakeRepo();
    repo.fehler = new Error('relation "geheim" does not exist');
    await setup(repo);
    const res = await app.inject('/api/v1/termine');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('geheim');
  });
});

describe('GET /api/v1/termine/:id', () => {
  it('liefert einen Termin oder 404', async () => {
    await setup();
    expect((await app.inject(`/api/v1/termine/${termin.id}`)).json()).toMatchObject({
      titel: 'Kirmestanz',
    });
    expect(
      (await app.inject('/api/v1/termine/00000000-0000-4000-8000-000000000000')).statusCode,
    ).toBe(404);
    expect((await app.inject("/api/v1/termine/1'%20OR%201=1")).statusCode).toBe(404);
  });
});

describe('Orte', () => {
  it('listet Orte mit Anzahl kommender Termine', async () => {
    await setup();
    const res = await app.inject('/api/v1/orte');
    expect(res.json()).toEqual([{ ...termin.ort, anzahlKommend: 3 }]);
  });

  it('findet einen Ort oder antwortet 404', async () => {
    await setup();
    expect((await app.inject('/api/v1/orte/muehlberg')).json()).toEqual(termin.ort);
    expect((await app.inject('/api/v1/orte/gibts-nicht')).statusCode).toBe(404);
    expect((await app.inject('/api/v1/orte/..%2F..%2Fetc')).statusCode).toBe(404);
  });

  it('filtert Termine nach Ort', async () => {
    const repo = await setup();
    await app.inject('/api/v1/termine?ort=muehlberg');
    expect(repo.filter?.ortSlug).toBe('muehlberg');
    expect((await app.inject('/api/v1/termine?ort=M%C3%BChl%20berg')).statusCode).toBe(400);
  });
});

describe('Verwaltung (Bearbeitungslink)', () => {
  const auth = { authorization: `Bearer ${TOKEN}` };

  it('verlangt einen gültigen Link', async () => {
    await setup();
    for (const headers of [{}, { authorization: 'Bearer falsch' }, { authorization: TOKEN }]) {
      const res = await app.inject({ url: '/api/v1/verwaltung/festplaetze', headers });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
    }
  });

  it('liefert die Übersicht ohne Caching', async () => {
    await setup();
    const res = await app.inject({ url: '/api/v1/verwaltung/festplaetze', headers: auth });
    expect(res.json()).toMatchObject({
      bezeichnung: 'KG Mühlberg',
      veranstaltungsorte: ['Reitstall'],
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('speichert gültige und lehnt ungültige Festplätze ab', async () => {
    await setup();
    const ok = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      headers: auth,
      payload: { name: 'Reitstall', lat: 50.87, lon: 10.82 },
    });
    expect(ok.statusCode).toBe(200);
    const ausserhalb = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      headers: auth,
      payload: { name: 'Reitstall', lat: 48.1, lon: 11.5 },
    });
    expect(ausserhalb.statusCode).toBe(400);
    const extraFeld = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      headers: auth,
      payload: { name: 'x', lat: 50.9, lon: 11, ortSlug: 'anderer-ort' },
    });
    expect(extraFeld.statusCode).toBe(400);
    const ohneLink = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      payload: { name: 'x', lat: 50.9, lon: 11 },
    });
    expect(ohneLink.statusCode).toBe(401);
  });

  it('löscht Festplätze', async () => {
    await setup();
    const del = (name: string) =>
      app.inject({
        method: 'DELETE',
        url: `/api/v1/verwaltung/festplaetze?name=${name}`,
        headers: auth,
      });
    expect((await del('Reitstall')).statusCode).toBe(204);
    expect((await del('Gibtsnicht')).statusCode).toBe(404);
  });
});

describe('Termine der Kirmesgesellschaft', () => {
  const auth = { authorization: `Bearer ${TOKEN}` };
  const url = '/api/v1/verwaltung/termine';

  it('listet nur die Termine des eigenen Ortes', async () => {
    const repo = await setup();
    const res = await app.inject({ url, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(repo.filter?.ortSlug).toBe('muehlberg');
    expect((await app.inject({ url })).statusCode).toBe(401);
  });

  it('legt Termine an – Ort und Bestätigung kommen aus dem Link', async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url,
      headers: auth,
      payload: {
        datum: '2026-05-02',
        beginn: '20:00',
        titel: 'Maikirmes',
        veranstaltungsort: 'Saal',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().hinweise[0].code).toBe('KIRMES_AUSSERHALB_HERBST');
    const fremd = await app.inject({
      method: 'POST',
      url,
      headers: auth,
      payload: { datum: '2026-10-18', titel: 'x', ortSlug: 'anderer-ort' },
    });
    expect(fremd.statusCode).toBe(400);
    const kaputt = await app.inject({
      method: 'POST',
      url,
      headers: auth,
      payload: { datum: '31.02.', titel: 'x' },
    });
    expect(kaputt.statusCode).toBe(400);
  });

  it('ändert, bestätigt und löscht nur vorhandene Termine', async () => {
    await setup();
    const payload = { datum: '2026-10-18', titel: 'Kirmestanz' };
    expect(
      (await app.inject({ method: 'PUT', url: `${url}/${termin.id}`, headers: auth, payload }))
        .statusCode,
    ).toBe(200);
    const fremdeId = '00000000-0000-4000-8000-000000000000';
    expect(
      (await app.inject({ method: 'PUT', url: `${url}/${fremdeId}`, headers: auth, payload }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `${url}/kein-uuid`, headers: auth, payload }))
        .statusCode,
    ).toBe(404);
    expect(geaendert).not.toContain('aendere:kein-uuid');
    expect(
      (await app.inject({ method: 'POST', url: `${url}/${termin.id}/bestaetigen`, headers: auth }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'POST', url: `${url}/${fremdeId}/bestaetigen`, headers: auth }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}/${termin.id}`, headers: auth }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}/${fremdeId}`, headers: auth })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${url}/${termin.id}` })).statusCode).toBe(
      401,
    );
  });
});

describe('Querschnitt', () => {
  it('setzt Security-Header', async () => {
    await setup();
    const res = await app.inject('/health/live');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('liefert alle 23 Landkreise', async () => {
    await setup();
    expect((await app.inject('/api/v1/landkreise')).json()).toHaveLength(23);
  });

  it('nimmt nur interne Aufrufer vom Rate-Limit aus', () => {
    for (const ip of [
      '127.0.0.1',
      '::1',
      '10.0.0.5',
      '172.18.0.3',
      '192.168.1.2',
      '::ffff:172.20.0.4',
      'fd00::1',
    ]) {
      expect(istInternesNetz(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2a00:1450::1', undefined]) {
      expect(istInternesNetz(ip), String(ip)).toBe(false);
    }
  });

  it('Readiness spiegelt DB-Zustand', async () => {
    await setup(new FakeRepo(), false);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    await app.close();
    await setup(new FakeRepo(), true);
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
  });
});
