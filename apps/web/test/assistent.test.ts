import { describe, expect, it, vi } from 'vitest';
import { redaktionsRueckkehr } from '../src/lib/admin';
import {
  assistent,
  doppelterTitel,
  gueltigeTage,
  leseProgramm,
  sortiereProgramm,
  vorlage,
} from '../src/lib/assistent';
describe('Kirmes-Assistent', () => {
  it('Alkersleben-Vorlage für 4 Tage, mit Kirche und Muttizettel', () => {
    const z = vorlage('2027-09-17', '4');
    expect(z.map((z) => [z.datum, z.beginn, z.titel])).toEqual([
      ['2027-09-17', '18:00', 'Kirmesgottesdienst'],
      ['2027-09-17', '20:00', 'Kirmestanz'],
      ['2027-09-18', '08:00', 'Ständchen'],
      ['2027-09-18', '15:00', 'Kinderkirmes'],
      ['2027-09-18', '20:00', 'Kirmesparty'],
      ['2027-09-19', '10:00', 'Frühschoppen'],
      ['2027-09-20', '10:00', 'Kirmesausklang'],
    ]);
    expect(z[0]?.veranstaltungsort).toBe('Kirche');
    expect(z[4]?.muttizettel).toBe(true);
    // Nur der Kern ist vorab angehakt, der Rest wird angeboten (Issue #87)
    expect(z.filter((z) => z.aktiv).map((z) => z.titel)).toEqual([
      'Kirmesgottesdienst',
      'Kirmestanz',
      'Frühschoppen',
    ]);
    expect(z.some((z) => 'kern' in z)).toBe(false);
    expect(vorlage('2027-09-17', '3')).toHaveLength(6);
    expect(vorlage('2027-09-17', '2')).toHaveLength(5);
    expect(vorlage('bad', '4')).toEqual([]);
    expect(vorlage('2027-09-17', '1')).toMatchObject([
      { datum: '2027-09-17', titel: '', aktiv: true },
    ]);
  });
  it('Zusammenbau erhält Zeilen trotz abgewählter Checkbox und eigene Veranstaltungen', () => {
    const alt = vorlage('2027-09-17', '2');
    const f = new FormData();
    alt.forEach((z, i) => {
      f.set(`datum-${i}`, z.datum);
      f.set(`beginn-${i}`, z.beginn ?? '');
      f.set(`titel-${i}`, i === 3 ? 'Eigener Kindertanz' : z.titel);
    });
    f.set('aktiv-1', 'on');
    f.set('aktiv-3', 'on');
    const z = leseProgramm(f, alt, false);
    expect(z.filter((z) => z.aktiv).map((z) => z.titel)).toEqual([
      'Kirmestanz',
      'Eigener Kindertanz',
    ]);
    expect(z[0]?.veranstaltungsort).toBe('Kirche');
  });
  it('freiwillige Details und Speisen werden derselben Veranstaltung zugeordnet', () => {
    const alt = vorlage('2027-09-17', '4');
    const f = new FormData();
    f.set('band-5', 'Band');
    f.set('wo-5', 'Saal');
    f.set('info-5', 'Eintritt frei');
    f.set('mutti-5', 'on');
    f.set('gericht-5-1', 'Klöße');
    f.set('preis-5-1', '9,50');
    expect(leseProgramm(f, alt, true)[5]).toMatchObject({
      titel: 'Frühschoppen',
      band: 'Band',
      veranstaltungsort: 'Saal',
      info: 'Eintritt frei',
      muttizettel: true,
      speisen: [{ name: 'Klöße', preis: '9,50' }],
    });
  });
});

it('Formularherkunft wird am externen Host geprüft, unabhängig von interner SSR-Adresse', async () => {
  const form = new FormData();
  form.set('csrf_token', 'token');
  form.set('stand', '{}');
  const response = { status: 200, headers: new Headers() };
  const ctx = {
    request: new Request('http://intern:4321/termin-melden', {
      method: 'POST',
      headers: { origin: 'https://example.org', host: 'example.org' },
      body: form,
    }),
    url: new URL('http://intern:4321/termin-melden'),
    response,
    cookies: { get: () => ({ value: 'token' }) } as never,
    redirect: () => new Response(null, { status: 303 }),
    clientAddress: '127.0.0.1',
  };
  const stand = await assistent(ctx, false);
  expect(stand).not.toBeInstanceOf(Response);
  expect(response.status).toBe(400);
  const fremd = await assistent(
    {
      ...ctx,
      request: new Request('http://intern:4321/termin-melden', {
        method: 'POST',
        headers: { origin: 'https://evil.example', host: 'example.org' },
        body: new FormData(),
      }),
    },
    false,
  );
  expect(fremd).toBeInstanceOf(Response);
  expect((fremd as Response).status).toBe(403);
});

it('ersetzt ein bearbeitetes Programm erst nach ausdrücklicher Bestätigung', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    Response.json([
      {
        slug: 'musterort',
        name: 'Musterort',
        landkreis: 'IK',
        koordinate: null,
        anzahlKommend: 0,
      },
    ]),
  );
  const alterStand = {
    schritt: 1 as const,
    ortSlug: 'musterort',
    ab: '2027-09-16',
    tage: '4',
    zeilen: [
      {
        ...vorlage('2027-09-16', '4')[0],
        titel: 'Unser eigener Titel',
        band: 'Unsere Band',
        aktiv: true,
      },
    ],
    kontaktName: '',
    kontaktEmail: '',
    nachricht: '',
    bestaetigt: false,
    geladen: Date.now(),
    vorschlag: '',
    fehler: [],
  };
  const senden = async (stand: unknown, bestaetigen = false) => {
    const form = new FormData();
    form.set('csrf_token', 'token');
    form.set('stand', JSON.stringify(stand));
    form.set('ort', 'Musterort (IK)');
    form.set('ab', '2027-09-23');
    form.set('tage', '3');
    form.set('aktion', 'weiter');
    if (bestaetigen) form.set('programmErsetzen', 'on');
    return assistent(
      {
        request: new Request('http://example.org/termin-melden', { method: 'POST', body: form }),
        url: new URL('http://example.org/termin-melden'),
        response: { status: 200, headers: new Headers() },
        cookies: { get: () => ({ value: 'token' }) } as never,
        redirect: () => new Response(),
        clientAddress: '127.0.0.1',
      },
      false,
    );
  };
  try {
    const rueckfrage = await senden(alterStand);
    expect(rueckfrage).toMatchObject({
      schritt: 1,
      zeitraumWechsel: true,
      zeilen: alterStand.zeilen,
    });
    const neu = await senden(rueckfrage, true);
    expect(neu).toMatchObject({ schritt: 2, zeitraumWechsel: false });
    expect((neu as typeof alterStand).zeilen[0]?.titel).toBe('Kirmesgottesdienst');
  } finally {
    fetch.mockRestore();
  }
});

it('kehrt nach der Anmeldung nur zu eigenen Redaktionsseiten zurück', () => {
  expect(redaktionsRueckkehr('/admin/termine/123')).toBe('/admin/termine/123');
  expect(redaktionsRueckkehr('/admin?zeitraum=alle')).toBe('/admin?zeitraum=alle');
  for (const pfad of [
    null,
    '//example.org',
    '/admin-fremd',
    '/admin/../',
    'https://example.org',
    '/admin/\\example.org',
    '/admin/\n',
    'x'.repeat(501),
  ])
    expect(redaktionsRueckkehr(pfad)).toBe('/admin');
});

describe('Reihenfolge des Programms (Issue #149)', () => {
  const stand = (zeilen = vorlage('2027-09-17', '2').map((z) => ({ ...z, aktiv: true }))) => ({
    schritt: 2 as const,
    ortSlug: 'musterort',
    ab: '2027-09-17',
    tage: '2',
    zeilen,
    kontaktName: '',
    kontaktEmail: '',
    nachricht: '',
    bestaetigt: false,
    geladen: Date.now(),
    vorschlag: '',
    fehler: [],
  });
  const schritt2 = async (
    s: ReturnType<typeof stand>,
    aktion: string,
    aendern: (f: FormData) => void = () => {},
  ) => {
    const form = new FormData();
    form.set('csrf_token', 'token');
    form.set('stand', JSON.stringify(s));
    form.set('aktion', aktion);
    s.zeilen.forEach((z, i) => {
      if (z.aktiv) form.set(`aktiv-${i}`, 'on');
      form.set(`datum-${i}`, z.datum);
      form.set(`beginn-${i}`, z.beginn ?? '');
      form.set(`titel-${i}`, z.titel);
    });
    aendern(form);
    return (await assistent(
      {
        request: new Request('http://example.org/termin-melden', { method: 'POST', body: form }),
        url: new URL('http://example.org/termin-melden'),
        response: { status: 200, headers: new Headers() },
        cookies: { get: () => ({ value: 'token' }) } as never,
        redirect: () => new Response(),
        clientAddress: '127.0.0.1',
      },
      false,
    )) as ReturnType<typeof stand>;
  };
  const folge = (s: ReturnType<typeof stand>) =>
    s.zeilen.map((z) => `${z.datum.slice(8)} ${z.beginn || '--:--'} ${z.titel}`);

  it('sortiert nach Tag und Uhrzeit, ohne Uhrzeit ans Tagesende, sonst stabil', () => {
    expect(
      sortiereProgramm([
        { datum: '2027-09-18', beginn: '08:00', t: 'a' },
        { datum: '2027-09-17', beginn: '', t: 'b' },
        { datum: '2027-09-17', beginn: '20:00', t: 'c' },
        { datum: '2027-09-17', beginn: '20:00', t: 'd' },
        { datum: '2027-09-17', beginn: null, t: 'e' },
      ]).map((z) => z.t),
    ).toEqual(['c', 'd', 'b', 'e', 'a']);
  });

  it('geänderte Uhrzeit oder Tag landet an ihrem Platz', async () => {
    // Kirmesparty (Index 4, Sa 20:00) auf Freitag 22:00, Ständchen auf 21:00 am Samstag
    const neu = await schritt2(stand(), 'weiter', (f) => {
      f.set('datum-4', '2027-09-17');
      f.set('beginn-4', '22:00');
      f.set('beginn-2', '21:00');
    });
    expect(neu.schritt).toBe(3);
    expect(folge(neu)).toEqual([
      '17 18:00 Kirmesgottesdienst',
      '17 20:00 Kirmestanz',
      '17 22:00 Kirmesparty',
      '18 15:00 Kinderkirmes',
      '18 21:00 Ständchen',
    ]);
  });

  it('eigene Veranstaltung erst unten, beim Weiter an ihrem Platz', async () => {
    const mitNeuer = await schritt2(stand(), 'eigen');
    expect(mitNeuer.zeilen.at(-1)).toMatchObject({ titel: '', datum: '2027-09-17' });
    const neu = await schritt2(mitNeuer, 'weiter', (f) => {
      f.set('titel-5', 'Seniorennachmittag');
      f.set('beginn-5', '14:00');
    });
    expect(folge(neu)[0]).toBe('17 14:00 Seniorennachmittag');
  });

  it('gleicher Titel am gleichen Tag wird schon in Schritt 2 gemeldet', async () => {
    const neu = await schritt2(stand(), 'weiter', (f) => {
      f.set('titel-4', 'Kirmestanz');
      f.set('datum-4', '2027-09-17');
    });
    expect(neu.schritt).toBe(2);
    expect(neu.fehler.join(' ')).toContain('„Kirmestanz“ steht am Fr., 17.09. zweimal im Programm');
    // an verschiedenen Tagen ist der gleiche Titel in Ordnung, abgewählte Zeilen zählen nicht
    const z = vorlage('2027-09-17', '2');
    expect(
      doppelterTitel(z.map((x) => ({ ...x, titel: 'Kirmesdisco', aktiv: true }))),
    ).not.toBeNull();
    expect(
      doppelterTitel([
        { ...z[1]!, titel: 'Kirmesdisco', aktiv: true },
        { ...z[4]!, titel: 'Kirmesdisco', aktiv: true },
        { ...z[0]!, titel: 'Kirmesdisco', aktiv: false },
      ]),
    ).toBeNull();
  });
});

describe('eigene Dauer (Issue #150)', () => {
  const schritt1 = async (tage: string, tageEigen = '') => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json([
        {
          slug: 'musterort',
          name: 'Musterort',
          landkreis: 'IK',
          koordinate: null,
          anzahlKommend: 0,
        },
      ]),
    );
    const form = new FormData();
    form.set('csrf_token', 'token');
    form.set(
      'stand',
      JSON.stringify({
        schritt: 1,
        ortSlug: '',
        ab: '',
        tage: '4',
        zeilen: [],
        kontaktName: '',
        kontaktEmail: '',
        nachricht: '',
        bestaetigt: false,
        geladen: Date.now(),
        vorschlag: '',
        fehler: [],
      }),
    );
    form.set('ort', 'Musterort');
    form.set('ab', '2027-09-15');
    form.set('tage', tage);
    form.set('tageEigen', tageEigen);
    form.set('aktion', 'weiter');
    try {
      return (await assistent(
        {
          request: new Request('http://example.org/termin-melden', { method: 'POST', body: form }),
          url: new URL('http://example.org/termin-melden'),
          response: { status: 200, headers: new Headers() },
          cookies: { get: () => ({ value: 'token' }) } as never,
          redirect: () => new Response(),
          clientAddress: '127.0.0.1',
        },
        false,
      )) as { schritt: number; tage: string; fehler: string[]; zeilen: unknown[] };
    } finally {
      fetch.mockRestore();
    }
  };
  it('„Andere Dauer“ übernimmt die Zahl, die Vorlage bleibt Do–So', async () => {
    const s = await schritt1('eigen', '06');
    expect(s).toMatchObject({ schritt: 2, tage: '6', fehler: [] });
    expect(s.zeilen).toHaveLength(7);
    // ohne „eigen“ zählt das Zusatzfeld nicht
    expect(await schritt1('2', '9')).toMatchObject({ schritt: 2, tage: '2' });
  });
  it.each([
    ['eigen', ''],
    ['eigen', '15'],
    ['eigen', '0'],
    ['eigen', 'x'],
    ['99', ''],
  ])('ungültig: %s / %s', async (tage, eigen) => {
    const s = await schritt1(tage, eigen);
    expect(s.schritt).toBe(1);
    expect(s.fehler).toContain('Bitte die Anzahl der Tage wählen (1 bis 14).');
  });
  it('gueltigeTage', () => {
    expect(['1', '4', '14'].every(gueltigeTage)).toBe(true);
    expect(['0', '15', '', '1.5', 4].some(gueltigeTage)).toBe(false);
  });
});
