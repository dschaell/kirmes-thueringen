import {
  FindeOrt,
  ListeOrte,
  PersistenzNichtVerfuegbar,
  FindeTermin,
  SucheTermine,
  VerwalteFestplaetze,
  VerwalteTermine,
  AdminAnmeldung,
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  Registrierung,
  RedaktionsFestplaetze,
  type EinladungInfo,
  type Mitglied,
  type Rolle,
  MeldeAnRedaktion,
  Passkeys,
  Redaktion,
  type TerminVerwaltung,
  type Mitteilung,
  type FestplatzRepository,
  type OrtRepository,
  type KalenderDatum,
  type Termin,
  type TerminFilter,
  type TerminRepository,
  type Passkey,
} from '@kirmes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { baueApp, istInternesNetz } from '../src/interfaces/http/app.js';
import { SimpleWebAuthn, SpeicherChallenges } from '../src/infrastructure/webauthn.js';
import { SpeicherEinrichtungslinks } from '../src/infrastructure/einrichtungslinks.js';
import { SoftwareAuthenticator } from './software-authenticator.js';

const termin: Termin = {
  id: '6f1c0b6e-3d2a-4c1b-9f00-0123456789ab',
  ort: { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'GTH', koordinate: null },
  datum: '2026-10-18' as KalenderDatum,
  beginn: '20:00',
  titel: 'Kirmestanz',
  veranstaltungsort: 'Reitstall',
  kategorie: 'party',
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
  aendereAlle: async (aenderungen, loeschen) =>
    [...aenderungen.map((x) => x.id), ...loeschen].every((id) => id === termin.id),
  bestaetige: async (id) => id === termin.id,
  loesche: async (id) => id === termin.id,
};

const SITZUNG = 'S'.repeat(43);
let mitteilung: Mitteilung | null = null;

// Passkeys mit echtem WebAuthn-Adapter und Speicher-Repository
const ORIGIN = 'http://localhost:4321';
const gespeichertePasskeys: Passkey[] = [];
let passkeysAktiv: Passkeys | undefined;
let meldungenAktiv: MeldeAnRedaktion | undefined;
let einrichtungAktiv: Ersteinrichtung | undefined;
let beitrittAktiv: Beitritt | undefined;
let festplaetzeAktiv: RedaktionsFestplaetze | undefined;
let vorschlaegeAktiv: (() => Promise<{ bands: string[]; titel: string[] }>) | undefined;
const REDAKTION_SITZUNG = 'R'.repeat(43);
const neuePasskeys = (gesperrt = false) =>
  new Passkeys(
    {
      konto: async (a) => (a === '1' ? { kennung: 'kennung-1', name: 'Ryan' } : null),
      liste: async (a) => gespeichertePasskeys.filter((p) => p.adminId === a),
      findeNachCredential: async (c) =>
        gespeichertePasskeys.find((p) => p.credentialId === c) ?? null,
      lege: async (p) => {
        const neu = {
          ...p,
          id: String(gespeichertePasskeys.length + 1),
          erstelltAm: 'heute',
          zuletztGenutzt: null,
        };
        gespeichertePasskeys.push(neu);
        return { id: neu.id, name: neu.name, erstelltAm: 'heute', zuletztGenutzt: null };
      },
      merkeNutzung: async () => {},
      loesche: async (a, id) => {
        const i = gespeichertePasskeys.findIndex((p) => p.adminId === a && p.id === id);
        return i >= 0 && gespeichertePasskeys.splice(i, 1).length > 0;
      },
    },
    new SimpleWebAuthn(ORIGIN),
    new SpeicherChallenges(),
    { lege: async () => {}, pruefe: async () => null, beende: async () => {} },
    { merkeLogin: async () => {} },
    { neuesToken: () => SITZUNG },
    { gesperrt: () => gesperrt, fehlschlag: () => {}, erfolg: () => {} },
  );

/** Mitglieder und Einladungen im Speicher (je setup() frisch) */
let mitglieder: Mitglied[] = [];
const mitgliederRepo = () => {
  mitglieder = [
    { id: '1', name: 'Ryan', rolle: 'admin', erstelltAm: 'a', letzterLogin: null, passkeys: 1 },
    { id: '2', name: 'Moni', rolle: 'redaktion', erstelltAm: 'b', letzterLogin: null, passkeys: 1 },
  ];
  return {
    liste: async () => mitglieder,
    setzeRolle: async (id: string, rolle: Rolle) => {
      const m = mitglieder.find((x) => x.id === id);
      if (m) m.rolle = rolle;
      return !!m;
    },
    entferne: async (id: string) => {
      const n = mitglieder.length;
      mitglieder = mitglieder.filter((x) => x.id !== id);
      return mitglieder.length < n;
    },
    anzahlAdmins: async () => mitglieder.filter((x) => x.rolle === 'admin').length,
  };
};
let einladungen = new Map<string, { info: EinladungInfo; genutzt: boolean }>();
const einladungenRepo = () => {
  einladungen = new Map();
  return {
    lege: async (token: string, rolle: Rolle) => {
      const info = {
        id: String(einladungen.size + 1),
        rolle,
        erstelltAm: 'heute',
        laeuftAb: 'bald',
      };
      einladungen.set(token, { info, genutzt: false });
      return info;
    },
    finde: async (token: string) => {
      const e = einladungen.get(token);
      return e && !e.genutzt ? { id: e.info.id, rolle: e.info.rolle } : null;
    },
    offene: async () => [...einladungen.values()].filter((e) => !e.genutzt).map((e) => e.info),
    widerrufe: async (id: string) => {
      for (const [t, e] of einladungen)
        if (e.info.id === id && !e.genutzt) return einladungen.delete(t);
      return false;
    },
  };
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
    aktuelleMitteilung: async () => mitteilung,
    meldungen: meldungenAktiv,
    admin: {
      anmeldung: new AdminAnmeldung({
        lege: async () => {},
        pruefe: async (t) =>
          t === SITZUNG
            ? { adminId: '1', name: 'Ryan', rolle: 'admin' }
            : t === REDAKTION_SITZUNG
              ? { adminId: '2', name: 'Moni', rolle: 'redaktion' }
              : null,
        beende: async () => {},
      }),
      mitglieder: new Mitgliederverwaltung(mitgliederRepo(), einladungenRepo(), {
        neuesToken: () => 'E'.repeat(43),
      }),
      beitritt: beitrittAktiv,
      festplaetze: festplaetzeAktiv,
      vorschlaege: vorschlaegeAktiv,
      passkeys: passkeysAktiv,
      einrichtung: einrichtungAktiv,
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
      kategorien: ['familie', 'party'],
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

describe('Orte im Kartenausschnitt', () => {
  it('filtert per bbox und lehnt ungültige Ausschnitte mit 400 ab', async () => {
    await setup();
    const ok = await app.inject({ url: '/api/v1/orte?bbox=10.5,50.7,11.2,51.1' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()[0].slug).toBe('muehlberg');
    const falsch = await app.inject({ url: '/api/v1/orte?bbox=0,0,50,50' });
    expect(falsch.statusCode).toBe(400);
    expect(falsch.json().fehler[0].code).toBe('AUSSCHNITT_UNGUELTIG');
    expect((await app.inject({ url: '/api/v1/orte?unbekannt=1' })).statusCode).toBe(400);
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

  it('es gibt keine Anmeldung mit Passwort mehr', async () => {
    await setup();
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/anmelden',
      payload: { email: 'a@x.de', passwort: 'x', code: '123456' },
    });
    expect(r.statusCode).toBe(404);
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
      ['GET', '/api/v1/admin/mitglieder'],
      ['PUT', '/api/v1/admin/mitglieder/2/rolle'],
      ['DELETE', '/api/v1/admin/mitglieder/2'],
      ['GET', '/api/v1/admin/einladungen'],
      ['POST', '/api/v1/admin/einladungen'],
      ['DELETE', '/api/v1/admin/einladungen/1'],
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
      name: 'Ryan',
      rolle: 'admin',
      passkeys: false,
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

describe('Passkeys (WebAuthn)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  const post = (url: string, payload: object = {}, headers = {}) =>
    app.inject({ method: 'POST', url, payload, headers });

  it('einrichten, auflisten, anmelden, löschen – mit echten Signaturen', async () => {
    passkeysAktiv = neuePasskeys();
    await setup();
    passkeysAktiv = undefined;
    const geraet = new SoftwareAuthenticator(ORIGIN);

    // Einrichtung nur mit Sitzung
    expect((await post('/api/v1/admin/passkeys/optionen')).statusCode).toBe(401);
    const opt = (await post('/api/v1/admin/passkeys/optionen', {}, auth)).json();
    expect(opt.optionen.rp.id).toBe('localhost');
    const neu = await post(
      '/api/v1/admin/passkeys',
      {
        vorgang: opt.vorgang,
        antwort: geraet.registriere(opt.optionen.challenge),
        name: 'MacBook',
      },
      auth,
    );
    expect(neu.statusCode).toBe(201);
    expect(neu.json()).toMatchObject({ id: '1', name: 'MacBook' });
    expect(
      (await app.inject({ url: '/api/v1/admin/passkeys', headers: auth })).json(),
    ).toHaveLength(1);
    expect((await app.inject({ url: '/api/v1/admin/ich', headers: auth })).json().passkeys).toBe(
      true,
    );
    // Vorgang ist verbraucht
    const nochmal = await post(
      '/api/v1/admin/passkeys',
      { vorgang: opt.vorgang, antwort: geraet.registriere(opt.optionen.challenge) },
      auth,
    );
    expect(nochmal.statusCode).toBe(400);

    // Anmeldung ohne Sitzung
    const a = (await post('/api/v1/admin/passkey-anmeldung/optionen')).json();
    const ok = await post('/api/v1/admin/passkey-anmeldung', {
      vorgang: a.vorgang,
      antwort: geraet.melde(a.optionen.challenge),
    });
    expect(ok.json()).toEqual({ token: SITZUNG, stunden: 12 });
    expect(ok.headers['cache-control']).toBe('no-store');

    // Phishing-Seite: gleiche Challenge, falsche Herkunft
    const b = (await post('/api/v1/admin/passkey-anmeldung/optionen')).json();
    const phishing = await post('/api/v1/admin/passkey-anmeldung', {
      vorgang: b.vorgang,
      antwort: geraet.melde(b.optionen.challenge, { origin: 'https://evil.example' }),
    });
    expect(phishing.statusCode).toBe(401);
    expect(
      (await post('/api/v1/admin/passkey-anmeldung', { vorgang: 'x', antwort: 'kein objekt' }))
        .statusCode,
    ).toBe(400);

    // Löschen
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/admin/passkeys/9', headers: auth }))
        .statusCode,
    ).toBe(404);
    // Der einzige Passkey bleibt – sonst wäre keine Anmeldung mehr möglich
    const letzter = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/passkeys/1',
      headers: auth,
    });
    expect(letzter.statusCode).toBe(409);
    // Mit einem zweiten Gerät darf der erste gehen
    const opt2 = (await post('/api/v1/admin/passkeys/optionen', {}, auth)).json();
    const zweites = new SoftwareAuthenticator(ORIGIN);
    await post(
      '/api/v1/admin/passkeys',
      { vorgang: opt2.vorgang, antwort: zweites.registriere(opt2.optionen.challenge) },
      auth,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/admin/passkeys/1', headers: auth }))
        .statusCode,
    ).toBe(204);
  });

  it('meldet eine Sperre nach zu vielen Fehlversuchen mit 429', async () => {
    passkeysAktiv = neuePasskeys(true);
    await setup();
    passkeysAktiv = undefined;
    const r = await post('/api/v1/admin/passkey-anmeldung', { vorgang: 'x', antwort: {} });
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toBe('900');
  });

  it('ohne WEBSITE_URL gibt es keine Passkey-Endpunkte', async () => {
    await setup();
    expect((await post('/api/v1/admin/passkey-anmeldung/optionen')).statusCode).toBe(404);
  });
});

describe('Meldungen an die Redaktion', () => {
  const meldung = {
    art: 'termin',
    ort: 'Ulla',
    datum: '2026-11-07',
    titel: 'Kirmestanz',
    absender: 'KG Ulla',
    email: 'kg@ulla.de',
    dauerMs: 10_000,
  };
  const post = (payload: object, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/meldungen', payload, headers });

  it('nimmt Meldungen an, prüft Eingaben und begrenzt je Besucher-IP', async () => {
    const herkunft: string[] = [];
    let fehlerBeimSenden = false;
    meldungenAktiv = new MeldeAnRedaktion(
      {
        sende: async () => {
          if (fehlerBeimSenden) throw new Error('SMTP weg');
        },
      },
      {
        erlaube: (k) => {
          herkunft.push(k);
          return k !== '9.9.9.9';
        },
      },
      { erlaube: () => true },
    );
    await setup();
    meldungenAktiv = undefined;
    // Aufrufe der Website kommen aus dem internen Netz und nennen die Besucher-IP
    const r = await post(meldung, { 'x-kirmes-client-ip': '1.2.3.4' });
    expect(r.statusCode).toBe(202);
    expect(herkunft).toEqual(['1.2.3.4']);
    expect((await post({ ...meldung, email: 'kaputt' })).statusCode).toBe(400);
    expect((await post({ ...meldung, art: 'werbung' })).statusCode).toBe(400);
    expect((await post({ ...meldung, an: 'opfer@x.de' })).statusCode).toBe(400);
    expect((await post(meldung, { 'x-kirmes-client-ip': '9.9.9.9' })).statusCode).toBe(429);
    fehlerBeimSenden = true;
    expect((await post(meldung)).statusCode).toBe(502);
  });

  it('ohne SMTP-Konfiguration: 503 (die Website zeigt dann mailto)', async () => {
    await setup();
    expect((await post(meldung)).statusCode).toBe(503);
  });
});

/** Registrierung mit echtem WebAuthn-Adapter; angelegte Konten landen in `konten` */
function registrierungFuerTest(
  konten: { name: string; rolle: Rolle }[],
  einladungGenutzt?: (id: string) => boolean,
) {
  return new Registrierung(
    new SimpleWebAuthn(ORIGIN),
    new SpeicherChallenges(),
    {
      lege: async (k, _s, _n, b) => {
        if (b.art === 'erster-admin' && konten.some((x) => x.rolle === 'admin')) return null;
        if (b.art === 'einladung' && einladungGenutzt && !einladungGenutzt(b.einladungId))
          return null;
        konten.push({ name: k.name, rolle: k.rolle });
        return String(konten.length + 10);
      },
    },
    { lege: async () => {}, pruefe: async () => null, beende: async () => {} },
    { neuesToken: () => SITZUNG, neueKennung: () => 'kennung' },
  );
}

describe('Ersten Admin einrichten (Passkey)', () => {
  function einrichtung({ gesendetFehler = false } = {}) {
    const konten: { name: string; rolle: Rolle }[] = [];
    const post: { text: string }[] = [];
    let zaehler = 0;
    einrichtungAktiv = new Ersteinrichtung(
      { gibtEs: async () => konten.some((k) => k.rolle === 'admin') },
      new SpeicherEinrichtungslinks(),
      {
        sende: async (n) => {
          if (gesendetFehler) throw new Error('SMTP weg');
          post.push(n);
        },
      },
      { erlaube: () => ++zaehler <= 2 },
      registrierungFuerTest(konten),
      'http://localhost:4321',
    );
    return { konten, post };
  }
  const linkAus = (text: string) => /link=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? '';
  const post = (url: string, payload?: object) => app.inject({ method: 'POST', url, payload });

  it('ohne E-Mail-Versand: nicht möglich (503)', async () => {
    await setup();
    const s = await app.inject({ method: 'GET', url: '/api/v1/admin/einrichtung' });
    expect(s.json()).toEqual({ offen: false, moeglich: false });
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(503);
    const l = 'a'.repeat(43);
    expect((await app.inject({ url: `/api/v1/admin/einrichtung/${l}` })).statusCode).toBe(404);
    expect((await post(`/api/v1/admin/einrichtung/${l}/optionen`, { name: 'X' })).statusCode).toBe(
      404,
    );
    expect(
      (await post(`/api/v1/admin/einrichtung/${l}`, { vorgang: 'v', antwort: {} })).statusCode,
    ).toBe(404);
  });

  it('Link anfordern → Name → Passkey → Admin angelegt, danach gesperrt', async () => {
    const { konten, post: mails } = einrichtung();
    await setup();
    einrichtungAktiv = undefined;
    expect((await app.inject({ url: '/api/v1/admin/einrichtung' })).json()).toEqual({
      offen: true,
      moeglich: true,
    });
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(202);
    const link = linkAus(mails[0]!.text);
    expect((await app.inject({ url: `/api/v1/admin/einrichtung/${link}` })).json()).toEqual({
      gueltig: true,
    });
    expect((await app.inject({ url: '/api/v1/admin/einrichtung/kurz' })).statusCode).toBe(400);
    expect(
      (await app.inject({ url: `/api/v1/admin/einrichtung/${'b'.repeat(43)}` })).statusCode,
    ).toBe(404);

    // Name prüfen, dann Passkey mit echter Signatur
    expect(
      (await post(`/api/v1/admin/einrichtung/${link}/optionen`, { name: ' ' })).statusCode,
    ).toBe(400);
    const opt = (await post(`/api/v1/admin/einrichtung/${link}/optionen`, { name: 'Ryan' })).json();
    expect(opt.optionen.user.name).toBe('Ryan');
    expect(opt.optionen.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
    const geraet = new SoftwareAuthenticator(ORIGIN);
    // Phishing-Herkunft wird abgelehnt
    const falsch = await post(`/api/v1/admin/einrichtung/${link}`, {
      vorgang: opt.vorgang,
      antwort: geraet.registriere(opt.optionen.challenge, { origin: 'https://evil.example' }),
    });
    expect(falsch.statusCode).toBe(400);
    const opt2 = (
      await post(`/api/v1/admin/einrichtung/${link}/optionen`, { name: 'Ryan' })
    ).json();
    const ok = await post(`/api/v1/admin/einrichtung/${link}`, {
      vorgang: opt2.vorgang,
      antwort: geraet.registriere(opt2.optionen.challenge),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ token: SITZUNG, stunden: 12 });
    expect(konten).toEqual([{ name: 'Ryan', rolle: 'admin' }]);

    // gesperrt
    expect((await app.inject({ url: '/api/v1/admin/einrichtung' })).json().offen).toBe(false);
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(409);
    expect(
      (await post(`/api/v1/admin/einrichtung/${link}/optionen`, { name: 'X' })).statusCode,
    ).toBe(409);
  });

  it('drosselt Links und meldet Versandfehler', async () => {
    einrichtung();
    await setup();
    einrichtungAktiv = undefined;
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(202);
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(202);
    const zuViele = await post('/api/v1/admin/einrichtung');
    expect(zuViele.statusCode).toBe(429);
    expect(zuViele.headers['retry-after']).toBe('3600');
    await app.close();
    einrichtung({ gesendetFehler: true });
    await setup();
    einrichtungAktiv = undefined;
    expect((await post('/api/v1/admin/einrichtung')).statusCode).toBe(502);
  });
});

describe('Mitglieder und Einladungen', () => {
  const alsAdmin = { authorization: `Sitzung ${SITZUNG}` };
  const alsRedaktion = { authorization: `Sitzung ${REDAKTION_SITZUNG}` };
  const rufe = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    headers: object,
    payload?: object,
  ) => app.inject({ method, url, headers, payload });

  it('Redaktion bekommt 403 bei allem, was Mitglieder betrifft', async () => {
    await setup();
    for (const [m, u, b] of [
      ['GET', '/api/v1/admin/mitglieder'],
      ['PUT', '/api/v1/admin/mitglieder/1/rolle', { rolle: 'redaktion' }],
      ['DELETE', '/api/v1/admin/mitglieder/1'],
      ['GET', '/api/v1/admin/einladungen'],
      ['POST', '/api/v1/admin/einladungen', { rolle: 'admin' }],
      ['DELETE', '/api/v1/admin/einladungen/1'],
    ] as const) {
      const r = await rufe(m, u, alsRedaktion, b);
      expect(r.statusCode, `${m} ${u}`).toBe(403);
    }
    // die eigene Rolle sieht die Redaktion
    expect((await rufe('GET', '/api/v1/admin/ich', alsRedaktion)).json().rolle).toBe('redaktion');
  });

  it('Admin verwaltet Mitglieder – der letzte Admin bleibt', async () => {
    await setup();
    expect((await rufe('GET', '/api/v1/admin/mitglieder', alsAdmin)).json()).toHaveLength(2);
    expect(
      (await rufe('PUT', '/api/v1/admin/mitglieder/1/rolle', alsAdmin, { rolle: 'redaktion' }))
        .statusCode,
    ).toBe(409);
    expect((await rufe('DELETE', '/api/v1/admin/mitglieder/1', alsAdmin)).statusCode).toBe(409);
    expect(
      (await rufe('PUT', '/api/v1/admin/mitglieder/2/rolle', alsAdmin, { rolle: 'chef' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await rufe('PUT', '/api/v1/admin/mitglieder/2/rolle', alsAdmin, { rolle: 'admin' }))
        .statusCode,
    ).toBe(204);
    expect((await rufe('DELETE', '/api/v1/admin/mitglieder/2', alsAdmin)).statusCode).toBe(204);
    expect((await rufe('DELETE', '/api/v1/admin/mitglieder/2', alsAdmin)).statusCode).toBe(404);
  });

  it('Einladung erzeugen, annehmen (Passkey), danach verbraucht', async () => {
    const konten: { name: string; rolle: Rolle }[] = [];
    await setup();
    // Beitritt nutzt dieselben Einladungen wie die Verwaltung dieses Setups
    const repo = {
      lege: async () => ({ id: '0', rolle: 'redaktion' as Rolle, erstelltAm: '', laeuftAb: '' }),
      finde: async (t: string) => {
        const e = einladungen.get(t);
        return e && !e.genutzt ? { id: e.info.id, rolle: e.info.rolle } : null;
      },
      offene: async () => [],
      widerrufe: async () => false,
    };
    const genutzt = (id: string) => {
      for (const e of einladungen.values())
        if (e.info.id === id && !e.genutzt) return (e.genutzt = true);
      return false;
    };
    const lade = await rufe('POST', '/api/v1/admin/einladungen', alsAdmin, { rolle: 'redaktion' });
    expect(lade.statusCode).toBe(201);
    const { token } = lade.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await rufe('GET', '/api/v1/admin/einladungen', alsAdmin)).json()).toHaveLength(1);
    await app.close();

    beitrittAktiv = new Beitritt(repo, registrierungFuerTest(konten, genutzt));
    const vorher = einladungen;
    await setup();
    einladungen = vorher; // setup() legt neue Einladungen an – die alte Einladung soll gelten
    beitrittAktiv = undefined;

    expect((await app.inject({ url: `/api/v1/admin/einladung/${token}` })).json()).toEqual({
      rolle: 'redaktion',
    });
    expect(
      (await app.inject({ url: `/api/v1/admin/einladung/${'x'.repeat(43)}` })).statusCode,
    ).toBe(404);
    const opt = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/einladung/${token}/optionen`,
        payload: { name: 'Moni' },
      })
    ).json();
    const geraet = new SoftwareAuthenticator(ORIGIN);
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/einladung/${token}`,
      payload: { vorgang: opt.vorgang, antwort: geraet.registriere(opt.optionen.challenge) },
    });
    expect(ok.json()).toEqual({ token: SITZUNG, stunden: 12 });
    expect(konten).toEqual([{ name: 'Moni', rolle: 'redaktion' }]);
    expect((await app.inject({ url: `/api/v1/admin/einladung/${token}` })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/einladung/${token}/optionen`,
          payload: { name: 'X' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('Einladung widerrufen', async () => {
    await setup();
    const { id } = (
      await rufe('POST', '/api/v1/admin/einladungen', alsAdmin, { rolle: 'admin' })
    ).json();
    expect((await rufe('DELETE', `/api/v1/admin/einladungen/${id}`, alsAdmin)).statusCode).toBe(
      204,
    );
    expect((await rufe('DELETE', `/api/v1/admin/einladungen/${id}`, alsAdmin)).statusCode).toBe(
      404,
    );
  });

  it('ohne WEBSITE_URL keine Einladung annehmen', async () => {
    await setup();
    const t = 'z'.repeat(43);
    expect((await app.inject({ url: `/api/v1/admin/einladung/${t}` })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/einladung/${t}/optionen`,
          payload: { name: 'X' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/einladung/${t}`,
          payload: { vorgang: 'v', antwort: {} },
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('Ganze Kirmes bearbeiten (Issue #65)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  const zeile = {
    id: termin.id,
    datum: '2026-10-17',
    titel: 'Kirmestanz',
    beginn: '20:00',
    band: 'Belconda',
  };
  const post = (payload: object, headers: object = auth) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/termine/sammel', headers, payload });

  it('speichert alle Zeilen, prüft Eingaben und Zugehörigkeit', async () => {
    await setup();
    expect((await post({ ortSlug: 'muehlberg', zeilen: [zeile] }, {})).statusCode).toBe(401);
    expect((await post({ ortSlug: 'muehlberg', zeilen: [zeile] })).statusCode).toBe(200);
    expect(
      (await post({ ortSlug: 'muehlberg', zeilen: [{ ...zeile, loeschen: true }] })).statusCode,
    ).toBe(200);
    // fremder Termin → nichts gespeichert
    expect(
      (
        await post({
          ortSlug: 'muehlberg',
          zeilen: [
            zeile,
            { ...zeile, id: '99999999-9999-4999-8999-999999999999', titel: 'Kirmesparty' },
          ],
        })
      ).statusCode,
    ).toBe(404);
    expect((await post({ ortSlug: 'gibtsnicht', zeilen: [zeile] })).statusCode).toBe(404);
    expect(
      (await post({ ortSlug: 'muehlberg', zeilen: [{ ...zeile, titel: '' }] })).statusCode,
    ).toBe(400);
    expect(
      (await post({ ortSlug: 'muehlberg', zeilen: [{ ...zeile, id: 'kaputt' }] })).statusCode,
    ).toBe(400);
    expect((await post({ ortSlug: 'muehlberg', zeilen: [] })).statusCode).toBe(400);
  });
});

describe('Plätze und Vorschläge (Redaktion, Issue #62)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  it('legt Plätze per Google-Maps-Link an, listet und löscht sie', async () => {
    const gespeichert: string[] = [];
    festplaetzeAktiv = new RedaktionsFestplaetze(
      {
        uebersicht: async (o) =>
          o === 'muehlberg' ? { ort: termin.ort, festplaetze: [], veranstaltungsorte: [] } : null,
        speichere: async (_o, f) => void gespeichert.push(f.name),
        loesche: async (_o, n) => n === 'Kirche',
      },
      async (o) => (o === 'muehlberg' ? 'GTH' : null),
      { aufloesen: async () => null },
    );
    vorschlaegeAktiv = async () => ({ bands: ['Belconda'], titel: ['Kirmestanz'] });
    await setup();
    festplaetzeAktiv = undefined;
    vorschlaegeAktiv = undefined;
    const url = '/api/v1/admin/orte/muehlberg/festplaetze';
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: auth })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/v1/admin/orte/gibtsnicht/festplaetze', headers: auth }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: '/api/v1/admin/orte/../festplaetze', headers: auth })).statusCode,
    ).toBe(404);
    const neu = await app.inject({
      method: 'POST',
      url,
      headers: auth,
      payload: { name: 'Kirche', standort: '50.95, 10.70' },
    });
    expect(neu.statusCode).toBe(201);
    expect(gespeichert).toEqual(['Kirche']);
    const falsch = await app.inject({
      method: 'POST',
      url,
      headers: auth,
      payload: { name: 'Kirche', standort: 'irgendwo' },
    });
    expect(falsch.statusCode).toBe(400);
    expect(falsch.json().fehler[0].feld).toBe('standort');
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}?name=Kirche`, headers: auth })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}?name=Zelt`, headers: auth })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/v1/admin/vorschlaege', headers: auth })).json()).toEqual({
      bands: ['Belconda'],
      titel: ['Kirmestanz'],
    });
  });

  it('ohne Konfiguration: keine Plätze-Routen, leere Vorschläge', async () => {
    await setup();
    expect(
      (await app.inject({ url: '/api/v1/admin/orte/muehlberg/festplaetze', headers: auth }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/v1/admin/vorschlaege', headers: auth })).json()).toEqual({
      bands: [],
      titel: [],
    });
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
