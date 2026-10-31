import { describe, expect, it } from 'vitest';
import {
  AdminAnmeldung,
  istKartenKurzlink,
  koordinateAusText,
  nameAusKartenlink,
  Redaktion,
  slugAus,
  validiereMitteilung,
  validiereOrt,
  type Berechtigung,
  type Mitteilung,
  type MitteilungRepository,
  type NeuerTermin,
  type Sitzungen,
  type TerminVerwaltung,
} from '../src/index.js';

describe('validiereMitteilung', () => {
  it('normalisiert und erlaubt nur sichere Links', () => {
    expect(
      validiereMitteilung({ titel: '  Neu!  ', text: 'a\r\n\r\n\r\nb', link: '/orte/ulla' }),
    ).toEqual({
      ok: true,
      value: { titel: 'Neu!', text: 'a\n\nb', link: '/orte/ulla' },
    });
    for (const link of [
      'javascript:alert(1)',
      'http://x.de',
      '//evil.example',
      'data:text/html,x',
    ]) {
      const r = validiereMitteilung({ titel: 'T', text: 'x', link });
      expect(!r.ok && r.error[0]?.code, link).toBe('LINK_UNGUELTIG');
    }
    expect(validiereMitteilung({ titel: '', text: '' }).ok).toBe(false);
  });
});

describe('validiereOrt / slugAus / koordinateAusText', () => {
  it('erzeugt Slugs wie das Ortsverzeichnis', () => {
    expect(slugAus('Mühlberg (Gotha)')).toBe('muehlberg-gotha');
    expect(slugAus('Großenlupnitz')).toBe('grossenlupnitz');
  });
  it('validiert Name, Landkreis und optionale Koordinate', () => {
    expect(validiereOrt({ name: ' Neudorf ', landkreis: 'gth' })).toEqual({
      ok: true,
      value: { slug: 'neudorf', name: 'Neudorf', landkreis: 'GTH', koordinate: null },
    });
    const r = validiereOrt({ name: '', landkreis: 'BY', lat: 48.1, lon: 11.5 });
    expect(!r.ok && r.error.map((f) => f.code)).toEqual([
      'NAME_LAENGE',
      'LANDKREIS_UNBEKANNT',
      'KOORDINATE_UNGUELTIG',
    ]);
  });
  it.each([
    ['50.8712, 10.8213', { lat: 50.8712, lon: 10.8213 }],
    ['https://www.google.com/maps/place/X/@50.87,10.82,17z', { lat: 50.87, lon: 10.82 }],
    ['https://maps.apple.com/?ll=50.9,11.0&q=X', { lat: 50.9, lon: 11.0 }],
    ['…!3d50.91!4d11.02…', { lat: 50.91, lon: 11.02 }],
    ['irgendwas', null],
    // Pin schlägt Kartenmitte (Issue #62): @ ist der Ausschnitt, !3d/!4d der gesetzte Ort
    [
      'https://www.google.com/maps/place/Kirche/@50.85,11.03,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d50.847493!4d11.041234',
      { lat: 50.847493, lon: 11.041234 },
    ],
  ])('%s', (text, erwartet) => expect(koordinateAusText(text)).toEqual(erwartet));
  it('erkennt Kurzlinks aus „Teilen → Link kopieren“', () => {
    expect(istKartenKurzlink('https://maps.app.goo.gl/AbC123xyz')).toBe(true);
    expect(istKartenKurzlink(' https://goo.gl/maps/AbC123 ')).toBe(true);
    expect(istKartenKurzlink('https://maps.app.goo.gl.evil.example/AbC')).toBe(false);
    expect(istKartenKurzlink('http://maps.app.goo.gl/AbC')).toBe(false);
    expect(istKartenKurzlink('50.8, 11.0')).toBe(false);
  });
});

describe('AdminAnmeldung (Sitzung)', () => {
  it('prüft und beendet Sitzungen – angemeldet wird nur mit Passkey', async () => {
    const beendet: string[] = [];
    const s: Sitzungen = {
      lege: async () => {},
      pruefe: async (t) => (t === 'TOKEN' ? { adminId: '1', name: 'Ryan', rolle: 'admin' } : null),
      beende: async (t) => void beendet.push(t),
    };
    const a = new AdminAnmeldung(s);
    expect(await a.pruefe('TOKEN')).toEqual({ adminId: '1', name: 'Ryan', rolle: 'admin' });
    expect(await a.pruefe('anders')).toBeNull();
    expect(await a.pruefe('')).toBeNull();
    await a.abmelden('TOKEN');
    expect(beendet).toEqual(['TOKEN']);
  });
});

describe('Redaktion', () => {
  function aufbau() {
    const gelegt: { t: NeuerTermin; b: Berechtigung }[] = [];
    const mitteilungen: Mitteilung[] = [];
    const repo: MitteilungRepository = {
      liste: async () => mitteilungen,
      aktuelle: async () => mitteilungen[0] ?? null,
      lege: async (m) => {
        const neu = { ...m, id: '1', veroeffentlichtAm: null, erstelltAm: 'jetzt' };
        mitteilungen.push(neu);
        return neu;
      },
      aendere: async (id, m) =>
        id === '1' ? { ...m, id, veroeffentlichtAm: null, erstelltAm: 'jetzt' } : null,
      setzeVeroeffentlicht: async (id) => id === '1',
      loesche: async (id) => id === '1',
    };
    const termine: TerminVerwaltung = {
      lege: async (t, b) => {
        gelegt.push({ t, b });
        return {
          id: 'x',
          ort: { slug: t.ortSlug, name: 'Ulla', landkreis: 'WL', koordinate: null },
          datum: t.datum,
          beginn: t.beginn,
          titel: t.titel,
          veranstaltungsort: t.veranstaltungsort,
          kategorie: t.kategorie,
          bestaetigt: t.bestaetigt,
          festplatz: null,
        };
      },
      aendere: async (id) => id === 'x',
      bestaetige: async (id) => id === 'x',
      loesche: async (id) => id === 'x',
    };
    const r = new Redaktion(
      repo,
      {
        lege: async (o) => (o.slug === 'vorhanden' ? null : { ...o }),
        aendere: async (slug: string) =>
          slug === 'eigen' ? 'geaendert' : slug === 'osm' ? 'ortsverzeichnis' : 'unbekannt',
      } as never,
      async (slug) => (slug === 'ulla' ? 'WL' : null),
      termine,
    );
    return { r, gelegt };
  }

  it('legt Mitteilungen nur gültig an', async () => {
    const { r } = aufbau();
    expect((await r.legeMitteilung({ titel: 'Hallo', text: 'Welt' }, '1')).ok).toBe(true);
    expect((await r.legeMitteilung({ titel: '', text: '' }, '1')).ok).toBe(false);
    expect(await r.veroeffentliche('1', true)).toBe(true);
    expect(await r.loescheMitteilung('2')).toBe(false);
    expect(await r.listeMitteilungen()).toHaveLength(1);
  });

  it('ändert Mitteilungen mit denselben Regeln wie beim Anlegen (Issue #261)', async () => {
    const { r } = aufbau();
    const neu = await r.aendereMitteilung('1', {
      titel: '  Neu  ',
      text: 'Text',
      link: '/termine',
    });
    expect(neu.ok && neu.value).toMatchObject({ id: '1', titel: 'Neu', link: '/termine' });
    expect(await r.aendereMitteilung('2', { titel: 'T', text: 'x' })).toEqual({
      ok: true,
      value: null,
    });
    expect((await r.aendereMitteilung('1', { titel: '', text: '' })).ok).toBe(false);
  });

  it('legt Orte an und meldet vergebene Adressen', async () => {
    const { r } = aufbau();
    expect((await r.legeOrt({ name: 'Neudorf', landkreis: 'WL' }, '1')).ok).toBe(true);
    const doppelt = await r.legeOrt({ name: 'Vorhanden', landkreis: 'WL' }, '1');
    expect(!doppelt.ok && doppelt.error[0]?.code).toBe('ORT_VORHANDEN');
  });

  it('ändert Name/Landkreis nur bei selbst angelegten Orten (Issue #216)', async () => {
    const { r } = aufbau();
    const code = (x: Awaited<ReturnType<typeof r.aendereOrt>>) => (x.ok ? 'ok' : x.error[0]?.code);
    expect(code(await r.aendereOrt('eigen', { name: ' Neu  dorf ', landkreis: 'WL' }, '1'))).toBe(
      'ok',
    );
    expect(code(await r.aendereOrt('osm', { name: 'Erfurt', landkreis: 'EF' }, '1'))).toBe(
      'ORTSVERZEICHNIS',
    );
    expect(code(await r.aendereOrt('weg', { name: 'X', landkreis: 'WL' }, '1'))).toBe(
      'ORT_UNBEKANNT',
    );
    expect(code(await r.aendereOrt('eigen', { name: '', landkreis: 'XX' }, '1'))).toBe(
      'NAME_LAENGE',
    );
  });

  it('validiert Mittagstisch schon vor dem atomaren Anlegen', async () => {
    const { r, gelegt } = aufbau();
    expect(
      (
        await r.legeTermin(
          {
            ortSlug: 'ulla',
            datum: '2027-09-17',
            titel: 'Frühschoppen',
            speisen: [{ name: 'Klöße', preis: '9,50' }],
          },
          '1',
        )
      ).ok,
    ).toBe(true);
    expect(gelegt[0]?.t.speisen).toEqual([{ name: 'Klöße', preisCent: 950 }]);
    expect(
      (
        await r.legeTermin(
          {
            ortSlug: 'ulla',
            datum: '2027-09-17',
            titel: 'Frühschoppen',
            speisen: [{ name: '', preis: '9' }],
          },
          '1',
        )
      ).ok,
    ).toBe(false);
    expect(gelegt).toHaveLength(1);
  });

  it('legt Termine für jeden Ort an – Bestätigung entscheidet die Redaktion', async () => {
    const { r, gelegt } = aufbau();
    const t = await r.legeTermin(
      { ortSlug: 'ulla', datum: '2026-10-18', titel: 'Kindertanz' },
      '1',
    );
    expect(t.ok).toBe(true);
    expect(gelegt[0]?.t).toMatchObject({
      landkreis: 'WL',
      kategorie: 'familie',
      bestaetigt: false,
    });
    expect(gelegt[0]?.b).toMatchObject({ linkId: null, adminId: '1', ortSlug: 'ulla' });
    await r.legeTermin(
      { ortSlug: 'ulla', datum: '2026-10-18', titel: 'Kirmes', bestaetigt: true },
      '1',
    );
    expect(gelegt[1]?.t.bestaetigt).toBe(true);
    const fremd = await r.legeTermin(
      { ortSlug: 'nirgendwo', datum: '2026-10-18', titel: 'x' },
      '1',
    );
    expect(!fremd.ok && fremd.error[0]?.code).toBe('ORT_UNBEKANNT');
  });

  it('ändert, bestätigt und löscht Termine', async () => {
    const { r } = aufbau();
    const f = { ortSlug: 'ulla', datum: '2026-10-18', titel: 'Kirmes' };
    expect((await r.aendereTermin('x', f, '1')).ok).toBe(true);
    expect(await r.aendereTermin('y', f, '1')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect(await r.aendereTermin('x', { ...f, ortSlug: 'nirgendwo' }, '1')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect((await r.aendereTermin('x', { ...f, datum: 'kaputt' }, '1')).ok).toBe(false);
    expect(await r.bestaetigeTermin('x', 'ulla', '1')).toBe(true);
    expect(await r.bestaetigeTermin('x', 'nirgendwo', '1')).toBe(false);
    expect(await r.loescheTermin('x', 'ulla', '1')).toBe(true);
    expect(await r.loescheTermin('x', 'nirgendwo', '1')).toBe(false);
  });
});

describe('Randfälle der Use Cases', () => {
  it('Redaktion: gültiger Ort, aber ungültiger Termin', async () => {
    const r = new Redaktion(
      {
        liste: async () => [],
        aktuelle: async () => null,
        lege: async () => {
          throw new Error();
        },
        setzeVeroeffentlicht: async () => false,
        loesche: async () => false,
      },
      { lege: async () => null },
      async () => 'GTH',
      {
        lege: async () => {
          throw new Error('darf nicht aufgerufen werden');
        },
        aendere: async () => false,
        bestaetige: async () => false,
        loesche: async () => false,
      },
    );
    const t = await r.legeTermin({ ortSlug: 'x', datum: '2026-02-30', titel: '' }, '1');
    expect(!t.ok && t.error.map((f) => f.code).sort()).toEqual(['DATUM_UNGUELTIG', 'TITEL_LAENGE']);
  });
});

describe('nameAusKartenlink (Issue #165)', () => {
  const apostel =
    'https://www.google.com/maps/place/Gastst%C3%A4tte+Zum+einkehrenden+Apostel/@50.8603992,11.0904561,750m/data=!3m2!1e3!4b1!4m6!3m5!1s0x47a40a4b2daa8c43:0x8baf746836b47e95!8m2!3d50.8603992!4d11.093031!16s%2Fg%2F1td29bdg?entry=ttu&g_ep=EgoyMDI2MTAxMy4wIKXMDSoASAFQAw%3D%3D';
  it.each([
    [apostel, 'Gaststätte Zum einkehrenden Apostel'],
    ['https://www.google.de/maps/place/Kirche+St.+Peter/@50.9,11.0,17z', 'Kirche St. Peter'],
    [
      "https://www.google.com/maps/place/50%C2%B051'37.4%22N+11%C2%B005'34.9%22E/@50.86,11.09",
      null,
    ],
    ['https://www.google.com/maps/place/%E0%A4%A/@1,2', null],
    ['https://maps.app.goo.gl/Abc123', null],
    ['50.86, 11.09', null],
    ['https://www.google.com/maps/@50.86,11.09,17z', null],
  ])('%s → %s', (link, erwartet) => expect(nameAusKartenlink(link)).toBe(erwartet));
  it('nimmt den Pin, nicht die Kartenmitte', () => {
    expect(koordinateAusText(apostel)).toEqual({ lat: 50.8603992, lon: 11.093031 });
  });
});
