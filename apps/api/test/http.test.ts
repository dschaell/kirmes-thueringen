import {
  FindeOrt,
  ListeOrte,
  PersistenzNichtVerfuegbar,
  FindeTermin,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
  AdminAnmeldung,
  Redaktion,
  type TerminVerwaltung,
  type Mitteilung,
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
  band: 'Belconda',
  info: null,
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
  legeAlle: async (ts) =>
    ts.map((t) => ({ ...termin, titel: t.titel, datum: t.datum, band: t.band, info: t.info })),
  aendere: async (id) => (geaendert.push(`aendere:${id}`), id === termin.id),
  bestaetige: async (id) => id === termin.id,
  loesche: async (id) => id === termin.id,
};

const SITZUNG = 'S'.repeat(43);
let mitteilung: Mitteilung | null = null;

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
    aktuelleMitteilung: async () => mitteilung,
    admin: {
      anmeldung: new AdminAnmeldung(
        {
          findeNachEmail: async (e) =>
            e === 'admin@x.de'
              ? { id: '1', email: e, passwortHash: 'H', totpGeheimnis: 'G' }
              : null,
          merkeLogin: async () => {},
        },
        {
          pruefePasswort: async (p) => p === 'richtig',
          pruefeEinmalcode: (_g, c) => c === '123456',
          neuesToken: () => SITZUNG,
        },
        {
          lege: async () => {},
          pruefe: async (t) => (t === SITZUNG ? { adminId: '1', email: 'admin@x.de' } : null),
          beende: async () => {},
        },
        { gesperrt: (e) => e === 'gesperrt@x.de', fehlschlag: () => {}, erfolg: () => {} },
      ),
      redaktion: new Redaktion(
        {
          liste: async () => [],
          aktuelle: async () => null,
          lege: async (m) => ({ ...m, id: '5', veroeffentlichtAm: null, erstelltAm: 'jetzt' }),
          setzeVeroeffentlicht: async (id) => id === '5',
          loesche: async (id) => id === '5',
        },
        { lege: async (o) => ({ ...o }) },
        async (slug) => (slug === 'muehlberg' ? 'GTH' : null),
        terminVerwaltung,
        {
          erstelle: async (ortSlug, bezeichnung) =>
            ortSlug === 'muehlberg'
              ? {
                  id: '9',
                  ortSlug,
                  ortName: 'Mühlberg',
                  bezeichnung,
                  erstelltAm: 'heute',
                  zuletztGenutzt: null,
                  gesperrtAm: null,
                }
              : null,
          liste: async () => [],
          sperre: async (id) => id === '9',
        },
        { neuesToken: () => 'x' },
      ),
    },
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

  it('legt ein ganzes Kirmeswochenende an – mit Band und Hinweisen je Abend', async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url: `${url}/wochenende`,
      headers: auth,
      payload: {
        zeilen: [
          { datum: '2026-10-16', beginn: '20:00', titel: 'Kirmesdisco', band: 'DJ X' },
          { datum: '2026-10-17', titel: 'Kirmestanz', band: 'Belconda', info: 'Eintritt 8 €' },
          { datum: '2026-10-18', titel: 'Frühschoppen' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().termine.map((t: { band: string | null }) => t.band)).toEqual([
      'DJ X',
      'Belconda',
      null,
    ]);
    const fehler = await app.inject({
      method: 'POST',
      url: `${url}/wochenende`,
      headers: auth,
      payload: { zeilen: [{ datum: '2026-10-17', titel: '' }] },
    });
    expect(fehler.statusCode).toBe(400);
    expect(fehler.json().fehler[0].feld).toBe('zeile1.titel');
    const leer = await app.inject({
      method: 'POST',
      url: `${url}/wochenende`,
      headers: auth,
      payload: { zeilen: [] },
    });
    expect(leer.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/wochenende`,
          payload: { zeilen: [{ datum: '2026-10-17', titel: 'x' }] },
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe('Mitteilungen (öffentlich)', () => {
  it('liefert die neueste veröffentlichte Mitteilung oder 404', async () => {
    await setup();
    mitteilung = null;
    expect((await app.inject('/api/v1/mitteilungen/aktuell')).statusCode).toBe(404);
    mitteilung = {
      id: '3',
      titel: 'Neu',
      text: 'Hallo',
      link: null,
      veroeffentlichtAm: '2026-10-14T10:00',
      erstelltAm: 'x',
    };
    expect((await app.inject('/api/v1/mitteilungen/aktuell')).json()).toEqual({
      id: '3',
      titel: 'Neu',
      text: 'Hallo',
      link: null,
      datum: '2026-10-14T10:00',
    });
  });
});

describe('Admin-Bereich', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  const anmelden = (body: object) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/anmelden', payload: body });

  it('meldet an – nur mit Passwort UND Einmalcode', async () => {
    await setup();
    const ok = await anmelden({ email: 'admin@x.de', passwort: 'richtig', code: '123456' });
    expect(ok.json()).toEqual({ token: SITZUNG, stunden: 12 });
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(
      (await anmelden({ email: 'admin@x.de', passwort: 'richtig', code: '000000' })).statusCode,
    ).toBe(401);
    expect(
      (await anmelden({ email: 'admin@x.de', passwort: 'falsch', code: '123456' })).statusCode,
    ).toBe(401);
    expect(
      (await anmelden({ email: 'gesperrt@x.de', passwort: 'richtig', code: '123456' })).statusCode,
    ).toBe(429);
  });

  it('schützt alle Admin-Endpunkte', async () => {
    await setup();
    const routen: [string, string][] = [
      ['GET', '/api/v1/admin/ich'],
      ['GET', '/api/v1/admin/mitteilungen'],
      ['POST', '/api/v1/admin/mitteilungen'],
      ['POST', '/api/v1/admin/orte'],
      ['POST', '/api/v1/admin/termine'],
      ['POST', '/api/v1/admin/termine/wochenende'],
      ['GET', '/api/v1/admin/links'],
      ['POST', '/api/v1/admin/links/1/sperren'],
    ];
    for (const [method, url] of routen) {
      for (const headers of [
        {},
        { authorization: 'Sitzung falsch' },
        { authorization: `Bearer ${SITZUNG}` },
      ]) {
        const res = await app.inject({ method: method as 'GET', url, headers, payload: {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    }
  });

  it('legt Mitteilungen, Orte und Termine an', async () => {
    await setup();
    expect((await app.inject({ url: '/api/v1/admin/ich', headers: auth })).json()).toEqual({
      adminId: '1',
    });
    const m = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/mitteilungen',
      headers: auth,
      payload: { titel: 'Willkommen', text: 'Der Kalender ist da.', sofort: true },
    });
    expect(m.statusCode).toBe(201);
    const boeserLink = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/mitteilungen',
      headers: auth,
      payload: { titel: 'X', text: 'Y', link: 'javascript:alert(1)' },
    });
    expect(boeserLink.statusCode).toBe(400);
    const ort = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/orte',
      headers: auth,
      payload: { name: 'Neudorf', landkreis: 'GTH', lat: 50.9, lon: 10.8 },
    });
    expect(ort.json()).toMatchObject({ slug: 'neudorf', koordinate: { lat: 50.9, lon: 10.8 } });
    const t = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine',
      headers: auth,
      payload: { ortSlug: 'muehlberg', datum: '2026-10-18', titel: 'Kirmestanz', bestaetigt: true },
    });
    expect(t.statusCode).toBe(201);
    const unbekannt = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine',
      headers: auth,
      payload: { ortSlug: 'nirgendwo', datum: '2026-10-18', titel: 'x' },
    });
    expect(unbekannt.statusCode).toBe(400);
    const we = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine/wochenende',
      headers: auth,
      payload: {
        ortSlug: 'muehlberg',
        zeilen: [
          { datum: '2026-10-17', titel: 'Kirmestanz', band: 'Belconda', bestaetigt: true },
          { datum: '2026-10-18', titel: 'Kirmestanz', band: 'Excite' },
        ],
      },
    });
    expect(we.statusCode).toBe(201);
    expect(we.json().termine).toHaveLength(2);
    const weDoppelt = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine/wochenende',
      headers: auth,
      payload: {
        ortSlug: 'muehlberg',
        zeilen: [
          { datum: '2026-10-17', titel: 'Kirmestanz' },
          { datum: '2026-10-17', titel: 'Kirmestanz' },
        ],
      },
    });
    expect(weDoppelt.statusCode).toBe(400);
    const weOrt = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine/wochenende',
      headers: auth,
      payload: { ortSlug: 'nirgendwo', zeilen: [{ datum: '2026-10-17', titel: 'x' }] },
    });
    expect(weOrt.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/mitteilungen/5/veroeffentlichen',
          headers: auth,
          payload: { an: false },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/admin/mitteilungen/6', headers: auth }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/admin/abmelden', headers: auth }))
        .statusCode,
    ).toBe(204);
  });
  it('ändert, bestätigt und löscht Termine jedes Ortes', async () => {
    await setup();
    const url = `/api/v1/admin/termine/${termin.id}`;
    const fremd = '/api/v1/admin/termine/00000000-0000-4000-8000-000000000000';
    const f = { ortSlug: 'muehlberg', datum: '2026-10-18', titel: 'Kirmes' };
    const status = async (o: object) =>
      (await app.inject({ headers: auth, ...o } as never)).statusCode;
    expect(await status({ method: 'PUT', url, payload: f })).toBe(200);
    expect(await status({ method: 'PUT', url: fremd, payload: f })).toBe(404);
    expect(await status({ method: 'PUT', url, payload: { ...f, datum: 'kaputt' } })).toBe(400);
    expect(
      await status({
        method: 'POST',
        url: `${url}/bestaetigen`,
        payload: { ortSlug: 'muehlberg' },
      }),
    ).toBe(204);
    expect(
      await status({
        method: 'POST',
        url: `${fremd}/bestaetigen`,
        payload: { ortSlug: 'muehlberg' },
      }),
    ).toBe(404);
    expect(await status({ method: 'DELETE', url: `${url}?ort=muehlberg` })).toBe(204);
    expect(await status({ method: 'DELETE', url: `${fremd}?ort=muehlberg` })).toBe(404);
  });

  it('verwaltet Bearbeitungslinks und Mitteilungen', async () => {
    await setup();
    const status = async (o: object) =>
      (await app.inject({ headers: auth, ...o } as never)).statusCode;
    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/links',
      headers: auth,
      payload: { ortSlug: 'muehlberg', bezeichnung: 'KG' },
    });
    expect(link.json()).toMatchObject({ token: 'x', link: { id: '9' } });
    expect(
      await status({
        method: 'POST',
        url: '/api/v1/admin/links',
        payload: { ortSlug: 'nirgendwo', bezeichnung: 'KG' },
      }),
    ).toBe(400);
    expect((await app.inject({ url: '/api/v1/admin/links', headers: auth })).json()).toEqual([]);
    expect(await status({ method: 'POST', url: '/api/v1/admin/links/9/sperren' })).toBe(204);
    expect(await status({ method: 'POST', url: '/api/v1/admin/links/8/sperren' })).toBe(404);
    expect((await app.inject({ url: '/api/v1/admin/mitteilungen', headers: auth })).json()).toEqual(
      [],
    );
    expect(
      await status({
        method: 'POST',
        url: '/api/v1/admin/mitteilungen/6/veroeffentlichen',
        payload: { an: true },
      }),
    ).toBe(404);
    expect(await status({ method: 'DELETE', url: '/api/v1/admin/mitteilungen/5' })).toBe(204);
    expect(
      await status({
        method: 'POST',
        url: '/api/v1/admin/orte',
        payload: { name: '', landkreis: 'XX' },
      }),
    ).toBe(400);
  });
});

describe('Fehler- und Randfälle der API', () => {
  it('beantwortet kaputtes JSON und zu große Anfragen mit Problem Details', async () => {
    await setup();
    const kaputt = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(kaputt.statusCode).toBe(400);
    expect(kaputt.headers['content-type']).toContain('application/problem+json');
    const riesig = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/festplaetze',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(20_000), lat: 50.9, lon: 11 }),
    });
    expect(riesig.statusCode).toBe(413);
    expect(riesig.body).not.toContain('FST_');
  });

  it('übernimmt bestaetigt, limit und offset in den Filter', async () => {
    const repo = await setup();
    await app.inject('/api/v1/termine?bestaetigt=false&limit=7&offset=14');
    expect(repo.filter).toMatchObject({ nurBestaetigt: false, limit: 7, offset: 14 });
  });

  it('verweigert alle Verwaltungsaktionen ohne gültigen Link', async () => {
    await setup();
    const ohne = { authorization: 'Bearer falsch' };
    const termin = { datum: '2026-10-18', titel: 'Kirmes' };
    const faelle: [string, string, object?][] = [
      ['DELETE', '/api/v1/verwaltung/festplaetze?name=x'],
      ['PUT', `/api/v1/verwaltung/termine/${termin.datum}`, termin],
      ['PUT', '/api/v1/verwaltung/termine/6f1c0b6e-3d2a-4c1b-9f00-0123456789ab', termin],
      ['POST', '/api/v1/verwaltung/termine/6f1c0b6e-3d2a-4c1b-9f00-0123456789ab/bestaetigen'],
      ['DELETE', '/api/v1/verwaltung/termine/6f1c0b6e-3d2a-4c1b-9f00-0123456789ab'],
      ['POST', '/api/v1/verwaltung/termine', termin],
    ];
    for (const [method, url, payload] of faelle) {
      const res = await app.inject({ method: method as 'GET', url, headers: ohne, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const ungueltig = await app.inject({
      method: 'PUT',
      url: '/api/v1/verwaltung/termine/6f1c0b6e-3d2a-4c1b-9f00-0123456789ab',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { datum: 'kaputt', titel: 'Kirmes' },
    });
    expect(ungueltig.statusCode).toBe(400);
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
