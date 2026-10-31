import type { PushAbhaengigkeiten } from '../src/interfaces/http/push-routen.js';
import {
  FindeOrt,
  ListeOrte,
  PersistenzNichtVerfuegbar,
  TerminKonflikt,
  LetzterAdmin,
  FindeTermin,
  SucheTermine,
  AdminAnmeldung,
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  MitmachAnfragen,
  Plakate,
  Ortsprofile,
  Zugriffe,
  type Anfrage,
  Registrierung,
  RedaktionsFestplaetze,
  type Vorschlaege,
  type EinladungInfo,
  type Mitglied,
  type Rolle,
  MeldeAnRedaktion,
  Passkeys,
  Redaktion,
  RedaktionsTermine,
  type TerminVerwaltung,
  type Mitteilung,
  type FestplatzRepository,
  type OrtRepository,
  type KalenderDatum,
  type Termin,
  type TerminFilter,
  type TerminRepository,
  type TerminHerkunft,
  type Passkey,
} from '@kirmes/core';
import { afterEach, describe, expect, it } from 'vitest';
import { baueApp, istInternesNetz } from '../src/interfaces/http/app.js';
import { SimpleWebAuthn, SpeicherChallenges } from '../src/infrastructure/webauthn.js';
import { SpeicherEinrichtungslinks } from '../src/infrastructure/einrichtungslinks.js';
import { SoftwareAuthenticator } from './software-authenticator.js';

const termin: Termin = {
  version: '1',
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

const festplatzRepo: FestplatzRepository & { gespeichert: unknown[] } = {
  gespeichert: [],
  uebersicht: async () => ({
    ort: termin.ort,
    festplaetze: [],
    veranstaltungsorte: ['Reitstall'],
    plaetze: [],
    eigenerOrt: false,
  }),
  speichere: async (_o, f) => {
    festplatzRepo.gespeichert.push(f);
  },
  loesche: async (_o, name) => name === 'Reitstall',
  benenneUm: async () => 'unbekannt',
  setzeOrtsmitte: async () => false,
};

const geaendert: string[] = [];
/** Mit welchem „bestätigt“ gespeichert wurde (Issue #240) */
const status: boolean[] = [];
const terminVerwaltung: TerminVerwaltung = {
  lege: async (t) => (status.push(t.bestaetigt), { ...termin, titel: t.titel, datum: t.datum }),
  legeAlle: async (ts) =>
    ts.map((t) => ({ ...termin, titel: t.titel, datum: t.datum, band: t.band, info: t.info })),
  aendere: async (id, t) => (
    geaendert.push(`aendere:${id}`),
    status.push(t.bestaetigt),
    id === termin.id
  ),
  setzeSpeisen: async (id) => id === termin.id,
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
let sicherungenAktiv: (() => Promise<unknown>) | undefined;
let anfragenAktiv: MitmachAnfragen | undefined;
let plakateAktiv: Plakate | undefined;
let ortsprofileAktiv: Ortsprofile | undefined;
let zugriffeAktiv: Zugriffe | undefined;
let pushAktiv: PushAbhaengigkeiten | undefined;
let vorschlaegeAktiv: (() => Promise<{ bands: string[]; titel: string[] }>) | undefined;
const REDAKTION_SITZUNG = 'R'.repeat(43);
const KG_SITZUNG = 'K'.repeat(43);
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
    setzeName: async (id: string, name: string) => {
      const m = mitglieder.find((x) => x.id === id);
      if (m) m.name = name;
      return !!m;
    },
    setzeKgName: async (ort: string) => ort === 'muehlberg',
  };
};
let einladungen = new Map<string, { info: EinladungInfo; genutzt: boolean }>();
const einladungenRepo = () => {
  einladungen = new Map();
  return {
    lege: async (
      token: string,
      rolle: Rolle,
      _von?: string | null,
      _tage?: number,
      _bez?: string,
      ortSlug?: string | null,
    ) => {
      const info = {
        id: String(einladungen.size + 1),
        rolle,
        ...(ortSlug ? { ortSlug } : {}),
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

let terminListeAktiv: RedaktionsTermine | undefined;
let herkunftAktiv:
  ((ids: string[], ortSlug?: string | null) => Promise<Record<string, TerminHerkunft>>) | undefined;
let terminVorschlaegeAktiv: Vorschlaege | undefined;
let app: Awaited<ReturnType<typeof baueApp>>;
async function setup(repo = new FakeRepo(), dbOk = true) {
  app = await baueApp({
    sucheTermine: new SucheTermine(repo, uhr),
    listeOrte: new ListeOrte(ortRepo, uhr),
    findeOrt: new FindeOrt(ortRepo),
    findeTermin: new FindeTermin(repo),
    aktuelleMitteilung: async () => mitteilung,
    plakate: plakateAktiv,
    zugriffe: zugriffeAktiv,
    push: pushAktiv,
    meldungen: meldungenAktiv,
    terminVorschlaege: terminVorschlaegeAktiv,
    admin: {
      terminListe: terminListeAktiv,
      terminHerkunft: herkunftAktiv,
      anmeldung: new AdminAnmeldung({
        lege: async () => {},
        pruefe: async (t) =>
          t === SITZUNG
            ? { adminId: '1', name: 'Ryan', rolle: 'admin' }
            : t === REDAKTION_SITZUNG
              ? { adminId: '2', name: 'Moni', rolle: 'redaktion' }
              : t === KG_SITZUNG
                ? {
                    adminId: '3',
                    name: 'KG Mühlberg',
                    rolle: 'kirmesgesellschaft',
                    ortSlug: 'muehlberg',
                    ortName: 'Mühlberg',
                    kgName: 'Dorffreunde Mühlberg e.V.',
                  }
                : null,
        beende: async () => {},
      }),
      terminFinden: (id) => repo.finde(id),
      mitglieder: new Mitgliederverwaltung(mitgliederRepo(), einladungenRepo(), {
        neuesToken: () => 'E'.repeat(43),
      }),
      beitritt: beitrittAktiv,
      festplaetze: festplaetzeAktiv,
      vorschlaege: vorschlaegeAktiv,
      sicherungen: sicherungenAktiv,
      anfragen: anfragenAktiv,
      plakate: plakateAktiv,
      ortsprofile: ortsprofileAktiv,
      zugriffe: zugriffeAktiv,
      passkeys: passkeysAktiv,
      einrichtung: einrichtungAktiv,
      redaktion: new Redaktion(
        {
          liste: async () => [],
          aktuelle: async () => null,
          lege: async (m) => ({ ...m, id: '5', veroeffentlichtAm: null, erstelltAm: 'jetzt' }),
          aendere: async (id, m) =>
            id === '5' ? { ...m, id, veroeffentlichtAm: null, erstelltAm: 'jetzt' } : null,
          setzeVeroeffentlicht: async (id) => id === '5',
          loesche: async (id) => id === '5',
        },
        {
          lege: async (o) => ({ ...o }),
          eigene: async () => [
            { slug: 'kirche-x', name: 'Kirche X', landkreis: 'GTH', termine: 0, vorschlaege: 0 },
          ],
          loesche: async (slug) =>
            slug === 'kirche-x'
              ? 'geloescht'
              : slug === 'muehlberg'
                ? 'ortsverzeichnis'
                : slug === 'belegt'
                  ? 'belegt'
                  : 'unbekannt',
          aendere: async (slug) =>
            slug === 'kirche-x'
              ? 'geaendert'
              : slug === 'muehlberg'
                ? 'ortsverzeichnis'
                : 'unbekannt',
        },
        async (slug) => (slug === 'muehlberg' ? 'GTH' : null),
        terminVerwaltung,
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
      kategorien: ['familie', 'tanz'],
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
  it('liefert den Mittagstisch in der Einzelansicht (#66)', async () => {
    class MitMittagstisch extends FakeRepo {
      override async finde(id: string) {
        const t = await super.finde(id);
        return t && { ...t, speisen: [{ name: 'Rostbrätel', preisCent: 750 }] };
      }
    }
    await setup(new MitMittagstisch());
    expect((await app.inject(`/api/v1/termine/${termin.id}`)).json().speisen).toEqual([
      { name: 'Rostbrätel', preisCent: 750 },
    ]);
    // Listen enthalten keinen Mittagstisch
    expect((await app.inject('/api/v1/termine')).json().termine[0].speisen).toBeUndefined();
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
      ortSlug: null,
      ortName: null,
      kgName: null,
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
    // Bestätigen nur die Kirmesgesellschaft (Issue #240)
    const bestaetigen = (u: string, headers: object) =>
      app.inject({
        method: 'POST',
        url: `${u}/bestaetigen`,
        headers,
        payload: { ortSlug: 'muehlberg' },
      });
    expect((await bestaetigen(url, auth)).statusCode).toBe(403);
    const kg = { authorization: `Sitzung ${KG_SITZUNG}` };
    expect((await bestaetigen(url, kg)).statusCode).toBe(204);
    expect((await bestaetigen(fremd, kg)).statusCode).toBe(404);
    expect(await status({ method: 'DELETE', url: `${url}?ort=muehlberg` })).toBe(204);
    expect(await status({ method: 'DELETE', url: `${fremd}?ort=muehlberg` })).toBe(404);
  });

  it('„bestätigt“ setzt nur die Kirmesgesellschaft – Redaktion nie, Bearbeiten behält (#240)', async () => {
    await setup();
    const kg = { authorization: `Sitzung ${KG_SITZUNG}` };
    const neu = { ortSlug: 'muehlberg', datum: '2026-10-18', titel: 'Kirmes', bestaetigt: true };
    status.length = 0;
    await app.inject({ method: 'POST', url: '/api/v1/admin/termine', headers: auth, payload: neu });
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/termine',
      headers: kg,
      payload: { ...neu, bestaetigt: false },
    });
    // Bearbeiten durch die Redaktion: bisheriger Stand (Testtermin ist bestätigt), egal was gesendet wird
    await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/termine/${termin.id}`,
      headers: auth,
      payload: { ...neu, bestaetigt: false },
    });
    expect(status).toEqual([false, true, termin.bestaetigt]);
  });

  it('verwaltet Mitteilungen', async () => {
    await setup();
    const status = async (o: object) =>
      (await app.inject({ headers: auth, ...o } as never)).statusCode;
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
    // Bearbeiten (Issue #261)
    const geaendert = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/mitteilungen/5',
      headers: auth,
      payload: { titel: 'Neu', text: 'Text', link: null },
    });
    expect(geaendert.json()).toMatchObject({ id: '5', titel: 'Neu' });
    expect(
      await status({
        method: 'PUT',
        url: '/api/v1/admin/mitteilungen/6',
        payload: { titel: 'Neu', text: 'Text' },
      }),
    ).toBe(404);
    expect(
      await status({
        method: 'PUT',
        url: '/api/v1/admin/mitteilungen/5',
        payload: { titel: ' ', text: 'Text' },
      }),
    ).toBe(400);
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
    // Konto ohne Eintrag (z. B. inzwischen entfernt) → nicht gefunden
    expect(
      (
        await post(
          '/api/v1/admin/passkeys/optionen',
          {},
          {
            authorization: `Sitzung ${KG_SITZUNG}`,
          },
        )
      ).statusCode,
    ).toBe(404);
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

  it('Sicherungsstand nur für Admins und nur, wenn das Verzeichnis eingebunden ist', async () => {
    sicherungenAktiv = undefined;
    await setup();
    expect((await rufe('GET', '/api/v1/admin/sicherungen', alsAdmin)).statusCode).toBe(404);
    await app.close();
    sicherungenAktiv = async () => ({ status: null, dateien: [] });
    await setup();
    sicherungenAktiv = undefined;
    expect((await rufe('GET', '/api/v1/admin/sicherungen', alsRedaktion)).statusCode).toBe(403);
    expect((await rufe('GET', '/api/v1/admin/sicherungen', {})).statusCode).toBe(401);
    const r = await rufe('GET', '/api/v1/admin/sicherungen', alsAdmin);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: null, dateien: [] });
  });

  it('Orte löschen nur als Admin, mit klaren Gründen (Issue #159)', async () => {
    await setup();
    expect((await rufe('GET', '/api/v1/admin/orte/eigene', alsRedaktion)).json()).toHaveLength(1);
    expect((await rufe('DELETE', '/api/v1/admin/orte/kirche-x', alsRedaktion)).statusCode).toBe(
      403,
    );
    expect((await rufe('DELETE', '/api/v1/admin/orte/kirche-x', alsAdmin)).statusCode).toBe(204);
    expect((await rufe('DELETE', '/api/v1/admin/orte/gibtsnicht', alsAdmin)).statusCode).toBe(404);
    const osm = await rufe('DELETE', '/api/v1/admin/orte/muehlberg', alsAdmin);
    expect(osm.statusCode).toBe(409);
    expect(osm.json().title).toContain('Ortsverzeichnis');
    expect((await rufe('DELETE', '/api/v1/admin/orte/belegt', alsAdmin)).json().title).toContain(
      'Termine oder Vorschläge',
    );
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

describe('Mittagstisch (Issue #66)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  const put = (id: string, payload: object, headers: object = auth) =>
    app.inject({ method: 'PUT', url: `/api/v1/admin/termine/${id}/speisen`, headers, payload });
  it('setzt Gerichte mit Preis, prüft Eingaben und Ort', async () => {
    await setup();
    const speisen = [{ name: 'Rostbrätel mit Brot', preis: '7,50' }];
    expect((await put(termin.id, { ortSlug: 'muehlberg', speisen }, {})).statusCode).toBe(401);
    const ok = await put(termin.id, { ortSlug: 'muehlberg', speisen });
    expect(ok.json()).toEqual({ speisen: [{ name: 'Rostbrätel mit Brot', preisCent: 750 }] });
    expect(
      (await put(termin.id, { ortSlug: 'muehlberg', speisen: [{ name: 'X', preis: 'viel' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put('11111111-1111-4111-8111-111111111111', { ortSlug: 'muehlberg', speisen }))
        .statusCode,
    ).toBe(404);
    expect((await put(termin.id, { ortSlug: 'muehlberg', speisen: 'x' })).statusCode).toBe(400);
  });
});

describe('Plätze und Vorschläge (Redaktion, Issue #62)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  it('legt Plätze per Google-Maps-Link an, listet und löscht sie', async () => {
    const gespeichert: string[] = [];
    festplaetzeAktiv = new RedaktionsFestplaetze(
      {
        uebersicht: async (o) =>
          o === 'muehlberg'
            ? {
                ort: termin.ort,
                festplaetze: [],
                veranstaltungsorte: [],
                plaetze: [],
                eigenerOrt: false,
              }
            : null,
        speichere: async (_o, f) => void gespeichert.push(f.name),
        loesche: async (_o, n) => n === 'Kirche',
        benenneUm: async (_o, alt) => (alt === 'Kirche' ? 'umbenannt' : 'unbekannt'),
        setzeOrtsmitte: async () => true,
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
    // ohne Namen = Hauptfestplatz; den gibt es hier nicht
    expect((await app.inject({ method: 'DELETE', url, headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/admin/vorschlaege', headers: auth })).json()).toEqual({
      bands: ['Belconda'],
      titel: ['Kirmestanz'],
    });
  });

  it('Plätze umbenennen, Ortsmitte, Ort ändern – mit Rechten (Issue #216)', async () => {
    festplaetzeAktiv = new RedaktionsFestplaetze(
      {
        uebersicht: async () => null,
        speichere: async () => {},
        loesche: async () => false,
        benenneUm: async (_o, alt) => (alt === 'Kirche' ? 'umbenannt' : 'unbekannt'),
        setzeOrtsmitte: async () => true,
      },
      async (o) => (o === 'muehlberg' || o === 'erfurt' ? 'GTH' : null),
      { aufloesen: async () => null },
    );
    await setup();
    festplaetzeAktiv = undefined;
    const red = { authorization: `Sitzung ${REDAKTION_SITZUNG}` };
    const kg = { authorization: `Sitzung ${KG_SITZUNG}` };
    const um = (ort: string, headers: object, payload: object) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/orte/${ort}/festplaetze/umbenennen`,
        headers,
        payload,
      });
    expect((await um('muehlberg', red, { alt: 'Kirche', neu: 'St. Marien' })).statusCode).toBe(204);
    const unbekannt = await um('muehlberg', red, { alt: 'Zelt', neu: 'X' });
    expect([unbekannt.statusCode, unbekannt.json().fehler[0].code]).toEqual([
      400,
      'PLATZ_UNBEKANNT',
    ]);
    expect((await um('muehlberg', red, { alt: 'Kirche' })).statusCode).toBe(400);
    // Kirmesgesellschaft: eigener Ort ja, fremder nein
    expect((await um('muehlberg', kg, { alt: 'Kirche', neu: 'St. Marien' })).statusCode).toBe(204);
    expect((await um('erfurt', kg, { alt: 'Kirche', neu: 'X' })).statusCode).toBe(403);

    const mitte = (headers: object, standort: string) =>
      app.inject({
        method: 'PUT',
        url: '/api/v1/admin/orte/muehlberg/mitte',
        headers,
        payload: { standort },
      });
    const m = await mitte(red, '50.95, 10.70');
    expect([m.statusCode, m.json()]).toEqual([200, { lat: 50.95, lon: 10.7 }]);
    expect((await mitte(red, 'irgendwo')).statusCode).toBe(400);
    expect((await mitte(kg, '50.95, 10.70')).statusCode).toBe(403);

    const ort = (slug: string, headers: object, payload: object) =>
      app.inject({ method: 'PUT', url: `/api/v1/admin/orte/${slug}`, headers, payload });
    expect((await ort('kirche-x', red, { name: 'Kirche Y', landkreis: 'GTH' })).statusCode).toBe(
      204,
    );
    const osm = await ort('muehlberg', red, { name: 'X', landkreis: 'GTH' });
    expect([osm.statusCode, osm.json().fehler[0].code]).toEqual([400, 'ORTSVERZEICHNIS']);
    expect((await ort('weg', red, { name: 'X', landkreis: 'GTH' })).statusCode).toBe(404);
    expect((await ort('kirche-x', red, { name: '', landkreis: 'GTH' })).statusCode).toBe(400);
    expect((await ort('muehlberg', kg, { name: 'X', landkreis: 'GTH' })).statusCode).toBe(403);
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
      method: 'POST',
      url: '/api/v1/meldungen',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(kaputt.statusCode).toBe(400);
    expect(kaputt.headers['content-type']).toContain('application/problem+json');
    const riesig = await app.inject({
      method: 'POST',
      url: '/api/v1/meldungen',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(2_000_000) }),
    });
    expect(riesig.statusCode).toBe(413);
    expect(riesig.body).not.toContain('FST_');
  });

  it('übernimmt bestaetigt, limit und offset in den Filter', async () => {
    const repo = await setup();
    await app.inject('/api/v1/termine?bestaetigt=false&limit=7&offset=14');
    expect(repo.filter).toMatchObject({ nurBestaetigt: false, limit: 7, offset: 14 });
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

describe('Assistent: öffentliche Eingabehilfen und transienter IP-Schlüssel', () => {
  it('Eingabe-Vorschläge funktionieren ohne Sitzung und bei leerem Bestand', async () => {
    vorschlaegeAktiv = undefined;
    await setup();
    expect((await app.inject('/api/v1/eingabe-vorschlaege')).json()).toEqual({
      bands: [],
      titel: [],
    });
    await app.close();
    vorschlaegeAktiv = async () => ({ bands: ['Belconda'], titel: ['Kirmestanz'] });
    await setup();
    expect((await app.inject('/api/v1/eingabe-vorschlaege')).json()).toEqual({
      bands: ['Belconda'],
      titel: ['Kirmestanz'],
    });
  });
  it('nur interner Website-Server darf den Besucher-IP-Schlüssel weiterreichen', async () => {
    const ips: string[] = [];
    terminVorschlaegeAktiv = {
      melde: async (_e: unknown, ip: string) => {
        ips.push(ip);
        return { ok: true, value: { angenommen: true } };
      },
    } as unknown as Vorschlaege;
    await setup();
    const anfrage = {
      method: 'POST' as const,
      url: '/api/v1/vorschlaege',
      payload: { ortSlug: 'muehlberg', zeilen: [{ datum: '2027-09-17', titel: 'Kirmestanz' }] },
    };
    try {
      await app.inject({ ...anfrage, headers: { 'x-kirmes-client-ip': '1.2.3.4' } });
      await app.inject({
        ...anfrage,
        remoteAddress: '8.8.8.8',
        headers: { 'x-kirmes-client-ip': '1.2.3.4' },
      });
      await app.inject(anfrage);
      expect(ips).toEqual(['1.2.3.4', '8.8.8.8', '127.0.0.1']);
    } finally {
      terminVorschlaegeAktiv = undefined;
    }
  });
});

describe('Sitzungspflichtige Redaktionsliste', () => {
  const baueListe = (repo: FakeRepo, gueltig = true) =>
    new RedaktionsTermine(
      repo,
      {
        pruefe: async () => (gueltig ? { adminId: '1', name: 'Test', rolle: 'redaktion' } : null),
        lege: async () => {},
        beende: async () => {},
      },
      uhr,
    );
  afterEach(() => {
    terminListeAktiv = undefined;
  });
  it('ohne Sitzung kein Lesen oder Validierungsdetail', async () => {
    const repo = new FakeRepo();
    terminListeAktiv = baueListe(repo);
    await setup(repo);
    expect((await app.inject('/api/v1/admin/termine?limit=ungültig')).statusCode).toBe(401);
    expect(repo.filter).toBeNull();
  });
  it('Redaktion filtert Ort/Titel/Band und Datum, paginiert und erhält Termine als DTO', async () => {
    const repo = new FakeRepo();
    terminListeAktiv = baueListe(repo);
    await setup(repo);
    const r = await app.inject({
      url: '/api/v1/admin/termine?q=Belconda&datum=2026-10-18&zeitraum=alle&limit=10&offset=20',
      headers: { authorization: `Sitzung ${REDAKTION_SITZUNG}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toMatchObject({ gesamt: 1, termine: [{ id: termin.id }] });
    expect(repo.filter).toMatchObject({
      suchtext: 'Belconda',
      limit: 10,
      offset: 20,
      bereich: { von: '2026-10-18', bis: '2026-10-18' },
    });
  });
  it('ungültige Daten, Grenzen und fremde Eigenschaften werden abgewiesen', async () => {
    const repo = new FakeRepo();
    terminListeAktiv = baueListe(repo);
    await setup(repo);
    for (const q of [
      'datum=2026-02-30',
      'limit=0',
      'limit=101',
      'offset=-1',
      'q=' + 'x'.repeat(101),
      'unbekannt=1',
      'zeitraum=unsinn',
    ])
      expect(
        (
          await app.inject({
            url: '/api/v1/admin/termine?' + q,
            headers: { authorization: `Sitzung ${SITZUNG}` },
          })
        ).statusCode,
      ).toBe(400);
    expect(repo.filter).toBeNull();
  });
  it('Sitzung wird im Use Case erneut geprüft', async () => {
    const repo = new FakeRepo();
    terminListeAktiv = baueListe(repo, false);
    await setup(repo);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/termine',
          headers: { authorization: `Sitzung ${SITZUNG}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(repo.filter).toBeNull();
  });
});

describe('Interne Terminersteller', () => {
  afterEach(() => {
    herkunftAktiv = undefined;
  });
  it('erlaubt nur angemeldete Admins und Redaktion, ohne öffentliche Metadaten', async () => {
    let aufrufe = 0;
    const metadaten = {
      name: 'Interner Ersteller',
      angelegtAm: '2026-10-17T12:00:00Z',
      weg: 'redaktion' as const,
    };
    herkunftAktiv = async (ids) => {
      aufrufe++;
      return Object.fromEntries(ids.map((id) => [id, metadaten]));
    };
    await setup();
    const url = '/api/v1/admin/termine/herkunft';
    for (const headers of [{}, { authorization: 'Sitzung falsch' }]) {
      expect(
        (await app.inject({ method: 'POST', url, headers, payload: { ids: ['ungueltig'] } }))
          .statusCode,
      ).toBe(401);
    }
    expect(aufrufe).toBe(0);
    for (const token of [SITZUNG, REDAKTION_SITZUNG]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Sitzung ${token}` },
        payload: { ids: [termin.id] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ [termin.id]: metadaten });
      expect(res.headers['cache-control']).toBe('no-store');
      for (const ids of [[], ['ungueltig'], [termin.id, termin.id]]) {
        expect(
          (
            await app.inject({
              method: 'POST',
              url,
              headers: { authorization: `Sitzung ${token}` },
              payload: { ids },
            })
          ).statusCode,
        ).toBe(400);
      }
    }
    expect(aufrufe).toBe(2);
    for (const url of ['/api/v1/termine', `/api/v1/termine/${termin.id}`]) {
      const res = await app.inject(url);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('Interner Ersteller');
      expect(res.body).not.toContain('angelegtAm');
      expect(res.body).not.toContain('herkunft');
    }
    expect(aufrufe).toBe(2);
  });
});

describe('Schreibkonflikte und private Bearbeitungsstände (#85)', () => {
  it('liefert Versionen nur geschützt, prüft Rollen und unbekannte IDs', async () => {
    await setup();
    for (const sitzung of [SITZUNG, REDAKTION_SITZUNG]) {
      const r = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/termine/${termin.id}`,
        headers: { authorization: `Sitzung ${sitzung}` },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().titel).toBe(termin.titel);
      expect(r.json().version).toBe('1');
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/termine/ungueltig' })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/admin/termine/00000000-0000-4000-8000-000000000000',
          headers: { authorization: `Sitzung ${SITZUNG}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/termine/${termin.id}` })).json(),
    ).not.toHaveProperty('version');
  });
  it('erwartbare Konflikte und atomarer Letztadminschutz antworten mit 409', async () => {
    await setup();
    app.get('/test-konflikt-neu', async () => {
      throw new TerminKonflikt('DOPPELT');
    });
    app.get('/test-konflikt-alt', async () => {
      throw new TerminKonflikt('VERALTET');
    });
    app.get('/test-konflikt-admin', async () => {
      throw new LetzterAdmin();
    });
    for (const pfad of ['neu', 'alt', 'admin']) {
      const r = await app.inject({ method: 'GET', url: `/test-konflikt-${pfad}` });
      expect(r.statusCode).toBe(409);
      expect(r.json().title).not.toBe('Interner Fehler');
    }
  });
});

it('begrenzt interne Einladungsbezeichnungen auch im Use Case', async () => {
  await setup();
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/einladungen',
    headers: { authorization: `Sitzung ${SITZUNG}` },
    payload: { rolle: 'redaktion', bezeichnung: 'x'.repeat(121) },
  });
  expect(r.statusCode).toBe(400);
  expect(r.json().title).toContain('120');
});

describe('Rolle Kirmesgesellschaft (Issue #180)', () => {
  const alsKG = { authorization: `Sitzung ${KG_SITZUNG}` };
  const rufe = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: alsKG, payload });
  const termin = {
    ortSlug: 'muehlberg',
    datum: '2026-10-17',
    titel: 'Kirmestanz',
    kategorie: 'party',
  };

  it('nicht freigegebene Bereiche → 403', async () => {
    await setup();
    for (const [m, u, b] of [
      ['PUT', '/api/v1/admin/mitglieder/1/rolle', { rolle: 'admin' }],
      ['GET', '/api/v1/admin/mitteilungen'],
      ['POST', '/api/v1/admin/orte', { name: 'X', landkreis: 'GTH' }],
      ['GET', '/api/v1/admin/orte/eigene'],
      ['DELETE', '/api/v1/admin/orte/muehlberg'],
    ] as const) {
      const r = await rufe(m, u, b);
      expect(r.statusCode, `${m} ${u}`).toBe(403);
    }
  });

  it('lädt eigene Leute ein: Rolle und Ort fest, fremder Ort/Rolle abgelehnt (Issue #231)', async () => {
    await setup();
    const neu = await rufe('POST', '/api/v1/admin/einladungen', {
      rolle: 'kirmesgesellschaft',
      bezeichnung: 'Lisa',
    });
    expect(neu.statusCode).toBe(201);
    expect(neu.json()).toMatchObject({ rolle: 'kirmesgesellschaft', ortSlug: 'muehlberg' });
    expect(
      (
        await rufe('POST', '/api/v1/admin/einladungen', {
          rolle: 'kirmesgesellschaft',
          ortSlug: 'erfurt',
        })
      ).statusCode,
    ).toBe(403);
    expect((await rufe('POST', '/api/v1/admin/einladungen', { rolle: 'admin' })).statusCode).toBe(
      400,
    );
    const offen = await rufe('GET', '/api/v1/admin/einladungen');
    expect(offen.json().map((e: { id: string }) => e.id)).toEqual([neu.json().id]);
    expect((await rufe('GET', '/api/v1/admin/mitglieder')).json()).toEqual([]);
    expect((await rufe('DELETE', `/api/v1/admin/einladungen/${neu.json().id}`)).statusCode).toBe(
      204,
    );
    // Namen (Issue #244): fremd nein, eigener (id 3, nicht in der Liste) → nicht gefunden
    expect((await rufe('PUT', '/api/v1/admin/mitglieder/1/name', { name: 'X' })).statusCode).toBe(
      403,
    );
    expect(
      (await rufe('PUT', '/api/v1/admin/mitglieder/3/name', { name: 'Kevin' })).statusCode,
    ).toBe(404);
    const admin = { authorization: `Sitzung ${SITZUNG}` };
    const um = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/mitglieder/2/name',
      headers: admin,
      payload: { name: ' Moni K. ' },
    });
    expect([um.statusCode, um.json()]).toEqual([200, { name: 'Moni K.' }]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/admin/mitglieder/2/name',
          headers: admin,
          payload: { name: '  ' },
        })
      ).statusCode,
    ).toBe(400);
    // Name der Kirmesgesellschaft (Issue #246): in /ich, eigener Ort ändern ja, fremder 403
    expect((await rufe('GET', '/api/v1/admin/ich')).json()).toMatchObject({
      rolle: 'kirmesgesellschaft',
      kgName: 'Dorffreunde Mühlberg e.V.',
    });
    const kgName = (ort: string) =>
      rufe('PUT', `/api/v1/admin/orte/${ort}/kirmesgesellschaft`, { name: 'Dorffreunde e.V.' });
    const eigen = await kgName('muehlberg');
    expect([eigen.statusCode, eigen.json()]).toEqual([200, { name: 'Dorffreunde e.V.' }]);
    expect((await kgName('erfurt')).statusCode).toBe(403);
    const alsAdmin = (ort: string, name: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/v1/admin/orte/${ort}/kirmesgesellschaft`,
        headers: { authorization: `Sitzung ${SITZUNG}` },
        payload: { name },
      });
    expect((await alsAdmin('gibtsnicht', 'X')).statusCode).toBe(404);
    expect((await alsAdmin('muehlberg', 'x'.repeat(201))).statusCode).toBe(400);
    // Entfernen nur eigene Leute (Issue #233): Redaktion/Admin sind „nicht gefunden“
    expect((await rufe('DELETE', '/api/v1/admin/mitglieder/2')).statusCode).toBe(404);
    expect((await rufe('DELETE', '/api/v1/admin/mitglieder/1')).statusCode).toBe(404);
  });

  it('fremder Ort → 403, eigener Ort → durchgelassen', async () => {
    festplaetzeAktiv = new RedaktionsFestplaetze(
      {
        uebersicht: async (o) =>
          o === 'muehlberg'
            ? ({ ort: {}, festplaetze: [], veranstaltungsorte: [] } as never)
            : null,
        speichere: async () => {},
        loesche: async () => true,
      },
      async (o) => (o === 'muehlberg' ? 'GTH' : null),
      { aufloesen: async () => null },
    );
    await setup();
    festplaetzeAktiv = undefined;
    const fremd = await rufe('POST', '/api/v1/admin/termine', { ...termin, ortSlug: 'erfurt' });
    expect(fremd.statusCode, fremd.body).toBe(403);
    expect(fremd.json().title).toContain('eures Ortes');
    expect(
      (
        await rufe('POST', '/api/v1/admin/termine/wochenende', {
          ortSlug: 'erfurt',
          zeilen: [{ datum: termin.datum, titel: termin.titel }],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await rufe(
          'DELETE',
          `/api/v1/admin/termine/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}?ort=erfurt`,
        )
      ).statusCode,
    ).toBe(403);
    expect((await rufe('GET', '/api/v1/admin/orte/erfurt/festplaetze')).statusCode).toBe(403);
    expect((await rufe('GET', '/api/v1/admin/orte/muehlberg/festplaetze')).statusCode).toBe(200);
    // eigener Ort: Rechteprüfung lässt durch (Ergebnis kommt von der Fachlogik)
    expect((await rufe('POST', '/api/v1/admin/termine', termin)).statusCode).not.toBe(403);
    expect((await rufe('GET', '/api/v1/admin/ich')).json()).toMatchObject({
      rolle: 'kirmesgesellschaft',
      ortSlug: 'muehlberg',
      ortName: 'Mühlberg',
    });
  });

  it('Einladung als Kirmesgesellschaft nur mit Ort; Rolle nicht per Wechsel', async () => {
    await setup();
    const alsAdmin = { authorization: `Sitzung ${SITZUNG}` };
    const ohneOrt = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/einladungen',
      headers: alsAdmin,
      payload: { rolle: 'kirmesgesellschaft' },
    });
    expect(ohneOrt.statusCode).toBe(400);
    expect(ohneOrt.json().title).toContain('Ort der Kirmesgesellschaft');
    const wechsel = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/mitglieder/2/rolle',
      headers: alsAdmin,
      payload: { rolle: 'kirmesgesellschaft' },
    });
    expect(wechsel.statusCode).toBe(400);
  });
});

describe('Herkunft für Kirmesgesellschaften (Issue #200)', () => {
  it('Route filtert nach dem Ort der Sitzung, Redaktion ohne Filter', async () => {
    const orte: (string | null | undefined)[] = [];
    herkunftAktiv = async (_ids, ortSlug) => (orte.push(ortSlug), {});
    await setup();
    herkunftAktiv = undefined;
    const rufe = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/admin/termine/herkunft',
        headers: { authorization: `Sitzung ${token}` },
        payload: { ids: ['11111111-1111-4111-8111-111111111111'] },
      });
    expect((await rufe(KG_SITZUNG)).statusCode).toBe(200);
    expect((await rufe(REDAKTION_SITZUNG)).statusCode).toBe(200);
    expect(orte).toEqual(['muehlberg', null]);
  });
});

describe('Mitmach-Anfragen (Issue #279)', () => {
  const auth = { authorization: `Sitzung ${SITZUNG}` };
  const anfrage: Anfrage = {
    id: '11111111-1111-4111-8111-111111111111',
    eingegangenAm: '2026-10-27',
    name: 'Lisa',
    email: 'lisa@example.org',
    ort: null,
    info: null,
    status: 'offen',
    erledigtAm: null,
    erledigtVon: null,
    grund: null,
  };
  const mit = async (versand: () => Promise<void>) => {
    let a = { ...anfrage };
    const post: string[] = [];
    anfragenAktiv = new MitmachAnfragen(
      {
        lege: async () => true,
        liste: async () => [a],
        finde: async (id) => (id === a.id ? a : null),
        erledige: async (_id, status) => ((a = { ...a, status, email: null }), true),
        raeumeAuf: async () => {},
      },
      new Mitgliederverwaltung(mitgliederRepo(), einladungenRepo(), {
        neuesToken: () => 'E'.repeat(43),
      }),
      { sendeAn: async (an) => (await versand(), void post.push(an)) },
      'https://k.de',
    );
    await setup();
    anfragenAktiv = undefined;
    return post;
  };
  const rufe = (method: 'GET' | 'POST', url: string, headers: object, payload?: object) =>
    app.inject({ method, url: `/api/v1/admin/anfragen${url}`, headers, payload } as never);

  it('Admin sieht, nimmt an (Mail), doppelt → 409; Redaktion und KG → 403', async () => {
    const post = await mit(async () => {});
    expect((await rufe('GET', '', auth)).json()).toHaveLength(1);
    const an = await rufe('POST', `/${anfrage.id}/annehmen`, auth, { rolle: 'redaktion' });
    expect([an.statusCode, an.json()]).toEqual([200, { email: 'lisa@example.org' }]);
    expect(post).toEqual(['lisa@example.org']);
    expect((await rufe('POST', `/${anfrage.id}/ablehnen`, auth, {})).statusCode).toBe(409);
    expect(
      (await rufe('POST', '/22222222-2222-4222-8222-222222222222/ablehnen', auth, {})).statusCode,
    ).toBe(404);
    for (const s of [REDAKTION_SITZUNG, KG_SITZUNG])
      expect((await rufe('GET', '', { authorization: `Sitzung ${s}` })).statusCode).toBe(403);
    expect(
      (await rufe('POST', `/${anfrage.id}/annehmen`, auth, { rolle: 'admin' })).statusCode,
    ).toBe(400);
  });

  it('Ablehnen ohne/mit Grund; Grund zu lang → 400; Versand scheitert → 502', async () => {
    const post = await mit(async () => {});
    const lang = await rufe('POST', `/${anfrage.id}/ablehnen`, auth, { grund: 'x'.repeat(1001) });
    expect(lang.statusCode).toBe(400);
    const mitGrund = await rufe('POST', `/${anfrage.id}/ablehnen`, auth, { grund: 'Leider nein' });
    expect([mitGrund.statusCode, mitGrund.json()]).toEqual([200, { gemailt: true }]);
    expect(post).toEqual(['lisa@example.org']);
    await app.close();
    await mit(async () => {});
    const ohne = await rufe('POST', `/${anfrage.id}/ablehnen`, auth, {});
    expect([ohne.statusCode, ohne.json()]).toEqual([200, { gemailt: false }]);
    await app.close();
    await mit(async () => {
      throw new Error('SMTP');
    });
    const r = await rufe('POST', `/${anfrage.id}/annehmen`, auth, { rolle: 'redaktion' });
    expect(r.statusCode).toBe(502);
  });

  it('ohne Mailversand nicht vorhanden', async () => {
    await setup();
    expect((await rufe('GET', '', auth)).statusCode).toBe(404);
  });
});

describe('Plakate (Issue #297)', () => {
  const T1 = '11111111-1111-4111-8111-111111111111';
  const T2 = '22222222-2222-4222-8222-222222222222';
  const bilder = new Map<string, Uint8Array>();
  const mit = async () => {
    plakateAktiv = new Plakate(
      {
        ortVon: async (id) => (id === T1 ? 'muehlberg' : id === T2 ? 'ulla' : null),
        speichere: async (id, b) => void bilder.set(id, b.gross),
        loesche: async (id) => bilder.delete(id),
        lade: async (id) => bilder.get(id) ?? null,
      },
      {
        wandle: async (d) => (d[0] === 0xff ? { gross: d, klein: d, breite: 10, hoehe: 20 } : null),
      },
    );
    await setup();
    plakateAktiv = undefined;
  };
  const lade = (sitzung: string, id: string, typ: string, body: Buffer | string) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/admin/termine/${id}/plakat`,
      headers: { authorization: `Sitzung ${sitzung}`, 'content-type': typ },
      payload: body,
    });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]);

  it('hochladen, öffentlich abrufen, entfernen', async () => {
    await mit();
    const r = await lade(SITZUNG, T1, 'image/jpeg', jpeg);
    expect([r.statusCode, r.json()]).toEqual([200, { breite: 10, hoehe: 20 }]);
    const bild = await app.inject({ method: 'GET', url: `/api/v1/termine/${T1}/plakat/gross` });
    expect([bild.statusCode, bild.headers['content-type'], bild.rawPayload]).toEqual([
      200,
      'image/webp',
      jpeg,
    ]);
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/termine/${T1}/plakat/riesig` })).statusCode,
    ).toBe(400);
    const weg = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/termine/${T1}/plakat`,
      headers: { authorization: `Sitzung ${SITZUNG}` },
    });
    expect(weg.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/termine/${T1}/plakat/klein` })).statusCode,
    ).toBe(404);
    const nochmal = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/termine/${T1}/plakat`,
      headers: { authorization: `Sitzung ${SITZUNG}` },
    });
    expect(nochmal.statusCode).toBe(404);
  });

  it('KG nur eigener Ort; kein Bild, falscher Typ, zu groß, ohne Anmeldung', async () => {
    await mit();
    expect((await lade(KG_SITZUNG, T1, 'image/png', jpeg)).statusCode).toBe(200);
    expect((await lade(KG_SITZUNG, T2, 'image/png', jpeg)).statusCode).toBe(404);
    expect((await lade(SITZUNG, T1, 'image/webp', Buffer.from('xx'))).statusCode).toBe(400);
    expect((await lade(SITZUNG, T1, 'image/svg+xml', '<svg/>')).statusCode).toBe(415);
    expect((await lade(SITZUNG, T1, 'application/json', '{}')).statusCode).toBe(415);
    expect(
      (await lade(SITZUNG, T1, 'image/jpeg', Buffer.alloc(8 * 1024 * 1024 + 1, 0xff))).statusCode,
    ).toBe(413);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/admin/termine/${T1}/plakat`,
          headers: { 'content-type': 'image/jpeg' },
          payload: jpeg,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('ohne Plakate nicht vorhanden', async () => {
    await setup();
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/termine/${T1}/plakat/gross` })).statusCode,
    ).toBe(404);
  });
});

describe('Vereinsprofil (Issue #310)', () => {
  const rufe = (sitzung: string, slug: string, payload: object) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/admin/orte/${slug}/profil`,
      headers: { authorization: `Sitzung ${sitzung}` },
      payload,
    });
  it('KG am eigenen Ort; fremder Ort 403; ungültig 400; unbekannt 404', async () => {
    ortsprofileAktiv = new Ortsprofile({ setze: async (slug) => slug !== 'fehlt' });
    await setup();
    ortsprofileAktiv = undefined;
    const ok = await rufe(KG_SITZUNG, 'muehlberg', { text: 'Hallo', website: 'kv.de' });
    expect([ok.statusCode, ok.json().website]).toEqual([200, 'https://kv.de/']);
    expect((await rufe(KG_SITZUNG, 'ulla', { text: 'x' })).statusCode).toBe(403);
    expect((await rufe(SITZUNG, 'muehlberg', { website: 'http://x.de' })).statusCode).toBe(400);
    expect((await rufe(SITZUNG, 'fehlt', {})).statusCode).toBe(404);
    expect((await rufe(REDAKTION_SITZUNG, 'ulla', { kontakt: 'Vereinsheim' })).statusCode).toBe(
      200,
    );
  });
  it('ohne Abhängigkeit nicht vorhanden', async () => {
    await setup();
    expect((await rufe(SITZUNG, 'muehlberg', {})).statusCode).toBe(404);
  });
});

describe('Zugriffszahlen (Issue #311)', () => {
  const mit = async () => {
    const erfasst: unknown[] = [];
    zugriffeAktiv = new Zugriffe({
      erfasse: async (a) => void erfasst.push(a),
      statistik: async () => ({ tage: [{ tag: '2026-10-30', anzahl: 4 }], seiten: [] }),
      raeumeAuf: async () => {},
    });
    await setup();
    zugriffeAktiv = undefined;
    return erfasst;
  };
  it('Meldung nur aus dem internen Netz; Statistik nur für Admins', async () => {
    const erfasst = await mit();
    const intern = await app.inject({
      method: 'POST',
      url: '/api/v1/intern/aufrufe',
      remoteAddress: '172.18.0.5',
      payload: { aufrufe: [{ pfad: '/orte/ulla', anzahl: 3 }] },
    });
    expect([intern.statusCode, intern.json()]).toEqual([200, { erfasst: 1 }]);
    const fremd = await app.inject({
      method: 'POST',
      url: '/api/v1/intern/aufrufe',
      remoteAddress: '203.0.113.9',
      payload: { aufrufe: [{ pfad: '/', anzahl: 1 }] },
    });
    expect(fremd.statusCode).toBe(404);
    expect(erfasst).toHaveLength(1);
    const s = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/zugriffe?tage=7',
      headers: { authorization: `Sitzung ${SITZUNG}` },
    });
    expect([s.statusCode, s.json().tage[0].anzahl]).toEqual([200, 4]);
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/zugriffe',
      headers: { authorization: `Sitzung ${REDAKTION_SITZUNG}` },
    });
    expect(r.statusCode).toBe(403);
  });
  it('ohne Abhängigkeit nicht vorhanden', async () => {
    await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/intern/aufrufe',
          remoteAddress: '127.0.0.1',
          payload: { aufrufe: [] },
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('Push-Routen nur mit Schlüsseln (Issue #348)', () => {
  it('ohne Abhängigkeit 404, mit Abhängigkeit der Schlüssel', async () => {
    await setup();
    expect((await app.inject({ method: 'GET', url: '/api/v1/push/schluessel' })).statusCode).toBe(
      404,
    );
    pushAktiv = { oeffentlich: 'BPub', benachrichtigungen: {} as never };
    await setup();
    pushAktiv = undefined;
    const r = await app.inject({ method: 'GET', url: '/api/v1/push/schluessel' });
    expect([r.statusCode, r.json()]).toEqual([200, { oeffentlich: 'BPub' }]);
  });
});
