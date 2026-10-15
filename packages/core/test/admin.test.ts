import { describe, expect, it } from 'vitest';
import {
  AdminAnmeldung,
  koordinateAusText,
  Redaktion,
  slugAus,
  validiereMitteilung,
  validiereOrt,
  type AdminKonten,
  type Anmeldeversuche,
  type Berechtigung,
  type Kryptografie,
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
  ])('%s', (text, erwartet) => expect(koordinateAusText(text)).toEqual(erwartet));
});

describe('AdminAnmeldung', () => {
  const konto = { id: '1', email: 'admin@x.de', passwortHash: 'H', totpGeheimnis: 'G' };
  function aufbau() {
    const fehl: string[] = [];
    const sitzungen: string[] = [];
    let gesperrt = false;
    const konten: AdminKonten = {
      findeNachEmail: async (e) => (e === konto.email ? konto : null),
      merkeLogin: async () => {},
    };
    const geprueft: string[] = [];
    const krypto: Kryptografie = {
      pruefePasswort: async (p, h) => (geprueft.push(h), p === 'richtig' && h === 'H'),
      pruefeEinmalcode: (_g, c) => c === '123456',
      neuesToken: () => 'TOKEN',
    };
    const s: Sitzungen = {
      lege: async (id, t) => void sitzungen.push(`${id}:${t}`),
      pruefe: async (t) => (t === 'TOKEN' ? { adminId: '1', email: konto.email } : null),
      beende: async () => {},
    };
    const v: Anmeldeversuche = {
      gesperrt: () => gesperrt,
      fehlschlag: (e) => void fehl.push(e),
      erfolg: () => {},
    };
    const a = new AdminAnmeldung(konten, krypto, s, v);
    return { a, fehl, sitzungen, geprueft, sperren: () => (gesperrt = true) };
  }

  it('meldet erfolgreich an und legt eine Sitzung an', async () => {
    const { a, sitzungen } = aufbau();
    expect(await a.anmelden(' Admin@X.de ', 'richtig', ' 123456 ')).toEqual({
      ok: true,
      value: { token: 'TOKEN', stunden: 12 },
    });
    expect(sitzungen).toEqual(['1:TOKEN']);
    expect(await a.pruefe('TOKEN')).toEqual({ adminId: '1', email: 'admin@x.de' });
    expect(await a.pruefe('')).toBeNull();
  });

  it('antwortet gleich bei unbekannter E-Mail, falschem Passwort und falschem Code', async () => {
    const { a, fehl, geprueft } = aufbau();
    expect(await a.anmelden('wer@x.de', 'richtig', '123456')).toEqual({
      ok: false,
      error: 'UNGUELTIG',
    });
    expect(await a.anmelden('admin@x.de', 'falsch', '123456')).toEqual({
      ok: false,
      error: 'UNGUELTIG',
    });
    expect(await a.anmelden('admin@x.de', 'richtig', '000000')).toEqual({
      ok: false,
      error: 'UNGUELTIG',
    });
    expect(fehl).toHaveLength(3);
    // auch bei unbekannter E-Mail wird ein Passwort-Hash geprüft (gleiche Rechenzeit)
    expect(geprueft).toHaveLength(3);
  });

  it('verweigert während einer Sperre ohne Prüfung', async () => {
    const { a, sperren, geprueft } = aufbau();
    sperren();
    expect(await a.anmelden('admin@x.de', 'richtig', '123456')).toEqual({
      ok: false,
      error: 'GESPERRT',
    });
    expect(geprueft).toHaveLength(0);
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
      { lege: async (o) => (o.slug === 'vorhanden' ? null : { ...o }) },
      async (slug) => (slug === 'ulla' ? 'WL' : null),
      termine,
      {
        erstelle: async (ortSlug, bezeichnung) =>
          ortSlug === 'ulla'
            ? {
                id: '9',
                ortSlug,
                ortName: 'Ulla',
                bezeichnung,
                erstelltAm: 'heute',
                zuletztGenutzt: null,
                gesperrtAm: null,
              }
            : null,
        liste: async () => [],
        sperre: async (id) => id === '9',
      },
      { neuesToken: () => 'LINKTOKEN' },
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

  it('legt Orte an und meldet vergebene Adressen', async () => {
    const { r } = aufbau();
    expect((await r.legeOrt({ name: 'Neudorf', landkreis: 'WL' }, '1')).ok).toBe(true);
    const doppelt = await r.legeOrt({ name: 'Vorhanden', landkreis: 'WL' }, '1');
    expect(!doppelt.ok && doppelt.error[0]?.code).toBe('ORT_VORHANDEN');
  });

  it('legt Termine für jeden Ort an – Bestätigung entscheidet die Redaktion', async () => {
    const { r, gelegt } = aufbau();
    const t = await r.legeTermin(
      { ortSlug: 'ulla', datum: '2026-10-18', titel: 'Kindertanz' },
      '1',
    );
    expect(t.ok).toBe(true);
    expect(gelegt[0]?.t).toMatchObject({ landkreis: 'WL', kategorie: 'kinder', bestaetigt: false });
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

  it('erstellt Bearbeitungslinks mit frischem Token', async () => {
    const { r } = aufbau();
    expect(await r.erstelleLink('ulla', 'KG Ulla')).toMatchObject({
      ok: true,
      value: { token: 'LINKTOKEN' },
    });
    expect((await r.erstelleLink('ulla', ' ')).ok).toBe(false);
    expect((await r.erstelleLink('nirgendwo', 'KG')).ok).toBe(false);
    expect(await r.sperreLink('9')).toBe(true);
    expect(await r.listeLinks()).toEqual([]);
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
      { erstelle: async () => null, liste: async () => [], sperre: async () => false },
      { neuesToken: () => 't' },
    );
    const t = await r.legeTermin({ ortSlug: 'x', datum: '2026-02-30', titel: '' }, '1');
    expect(!t.ok && t.error.map((f) => f.code).sort()).toEqual(['DATUM_UNGUELTIG', 'TITEL_LAENGE']);
  });
});
