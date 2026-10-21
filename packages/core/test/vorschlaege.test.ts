import { describe, expect, it, vi } from 'vitest';
import {
  Vorschlaege,
  pruefeVorschlag,
  istErlaubterKartenlink,
  vorschlagsMail,
  type VorschlagEingabe,
  type VorschlagsRepository,
  type OrtRepository,
  type Sitzungen,
} from '../src/index.js';
const eingabe = (): VorschlagEingabe => ({
  ortSlug: 'alkersleben',
  zeilen: [{ datum: '2027-09-17', beginn: '20:00', titel: 'Kirmestanz' }],
  dauerMs: 3000,
});
function setup() {
  const repo: VorschlagsRepository = {
    lege: vi.fn(async (): Promise<string | false> => '11111111-2222-4333-8444-555555555555'),
    liste: vi.fn(async () => []),
    finde: vi.fn(async () => null),
    anzahl: vi.fn(async () => 2),
    uebernehme: vi.fn(async () => true),
    lehneAb: vi.fn(async () => true),
    raeumeAuf: vi.fn(async () => {}),
  };
  const orte = {
    finde: vi.fn(async () => ({
      slug: 'alkersleben',
      name: 'Alkersleben',
      landkreis: 'IK',
      koordinate: null,
    })),
    liste: vi.fn(),
  } as OrtRepository;
  const sitzungen: Sitzungen = {
    pruefe: vi.fn(async () => ({ adminId: '1', name: 'Test', rolle: 'redaktion' as const })),
    lege: vi.fn(),
    beende: vi.fn(),
  };
  const post = { sende: vi.fn(async () => {}) };
  const ip = { erlaube: vi.fn(() => true) };
  const gesamt = { erlaube: vi.fn(() => true) };
  return {
    repo,
    orte,
    sitzungen,
    post,
    ip,
    gesamt,
    v: new Vorschlaege(repo, orte, sitzungen, post, ip, gesamt, 'https://example.org/'),
  };
}
const ID = 'ab000000-0000-4000-8000-000000000001';
describe('Öffentliche Vorschläge', () => {
  it('bereinigt alle Texte, erkennt die Art und validiert Speisen, ohne Bestätigung zu erlauben', async () => {
    const { orte } = setup();
    const e = eingabe();
    e.kontaktName = ' KG\u0000 Test ';
    e.kontaktEmail = ' test@example.org ';
    e.nachricht = 'Hallo\nWelt';
    e.zeilen = [
      {
        datum: '2027-09-19',
        titel: 'Frühschoppen',
        band: 'Musik\u0001',
        info: 'Mit\tEssen',
        veranstaltungsort: ' Saal ',
        speisen: [{ name: 'Klöße\u0000', preis: '9,50' }],
      },
    ];
    const r = await pruefeVorschlag(e, orte);
    expect(r).toMatchObject({
      ok: true,
      value: {
        kontaktName: 'KG  Test',
        kontaktEmail: 'test@example.org',
        nachricht: 'Hallo Welt',
        termine: [
          {
            kategorie: 'fruehschoppen',
            bestaetigt: false,
            beginn: null,
            band: 'Musik',
            info: 'Mit Essen',
            veranstaltungsort: 'Saal',
            speisen: [{ name: 'Klöße', preisCent: 950 }],
          },
        ],
      },
    });
  });
  it('übernimmt eine gewählte Art, sonst aus dem Titel (Issue #93)', async () => {
    const { orte } = setup();
    const e = eingabe();
    e.zeilen = [
      { datum: '2027-09-19', titel: 'Ständchen', kategorie: 'party' },
      { datum: '2027-09-19', titel: 'Kinderkirmes', kategorie: 'quatsch' as never },
      { datum: '2027-09-19', titel: 'Mittagstisch' },
    ];
    const r = await pruefeVorschlag(e, orte);
    expect(r.ok && r.value.termine.map((t) => t.kategorie)).toEqual(['party', 'familie', 'party']);
  });
  it('optionaler Kontakt, Mindestzeit und Mail ohne Reply-To', async () => {
    const { v, post, repo } = setup();
    expect((await v.melde(eingabe(), 'ip')).ok).toBe(true);
    expect(repo.lege).toHaveBeenCalledOnce();
    expect(post.sende).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('https://example.org/admin/vorschlaege'),
      }),
    );
    expect(post.sende.mock.calls[0]?.[0]).not.toHaveProperty('antwortAn');
  });
  it('Reply-To geht ausschließlich an den Postausgang, Mailausfall verliert den Vorschlag nicht', async () => {
    const { v, post, repo } = setup();
    post.sende.mockRejectedValueOnce(new Error('SMTP'));
    expect((await v.melde({ ...eingabe(), kontaktEmail: 'a@example.org' }, 'ip')).ok).toBe(true);
    expect(repo.lege).toHaveBeenCalledOnce();
    expect(post.sende).toHaveBeenCalledWith(
      expect.objectContaining({ antwortAn: 'a@example.org' }),
    );
  });
  it.each([{ falle: 'bot' }, { dauerMs: 2999 }, { dauerMs: undefined }, { dauerMs: NaN }])(
    'verwirft Spam vor Speicherung und Mail (%j)',
    async (extra) => {
      const { v, repo, post } = setup();
      expect((await v.melde({ ...eingabe(), ...extra }, 'ip')).ok).toBe(true);
      expect(repo.lege).not.toHaveBeenCalled();
      expect(post.sende).not.toHaveBeenCalled();
    },
  );
  it('begrenzt je IP und insgesamt', async () => {
    const { v, ip, gesamt, repo } = setup();
    ip.erlaube.mockReturnValueOnce(false);
    expect(await v.melde(eingabe(), 'ip')).toEqual({ ok: false, error: 'ZU_VIELE' });
    gesamt.erlaube.mockReturnValueOnce(false);
    expect(await v.melde(eingabe(), 'ip')).toEqual({ ok: false, error: 'ZU_VIELE' });
    expect(repo.lege).not.toHaveBeenCalled();
  });
  it('begrenzt offene Vorschläge pro Ort und sendet keine Mail bei Ablehnung', async () => {
    const { v, repo, post } = setup();
    vi.mocked(repo.lege).mockResolvedValue(false);
    expect(await v.melde(eingabe(), 'ip')).toEqual({ ok: false, error: 'ORT_VOLL' });
    expect(post.sende).not.toHaveBeenCalled();
  });
  it.each([{ zeilen: [] }, { zeilen: Array.from({ length: 21 }, () => eingabe().zeilen[0]) }])(
    'verweigert ungültige Mengen',
    async ({ zeilen }) => {
      const { v, repo } = setup();
      expect(
        (await v.melde({ ...eingabe(), zeilen: zeilen as VorschlagEingabe['zeilen'] }, 'ip')).ok,
      ).toBe(false);
      expect(repo.lege).not.toHaveBeenCalled();
    },
  );
  it('liefert alle Kontaktfehler und Terminfehler ohne Speicherung', async () => {
    const { v, repo } = setup();
    const r = await v.melde(
      {
        ...eingabe(),
        kontaktName: 'x'.repeat(121),
        kontaktEmail: 'bad',
        nachricht: 'x'.repeat(2001),
        zeilen: [{ datum: 'x', titel: '' }],
      },
      'ip',
    );
    expect(r).toMatchObject({
      ok: false,
      error: expect.arrayContaining([
        expect.objectContaining({ feld: 'kontaktName' }),
        expect.objectContaining({ feld: 'kontaktEmail' }),
        expect.objectContaining({ feld: 'nachricht' }),
      ]),
    });
    expect(repo.lege).not.toHaveBeenCalled();
  });
  it('Ort, E-Mail-Länge, Platzlänge, Speisen und doppelte Termine werden geprüft', async () => {
    const { orte } = setup();
    for (const extra of [
      { kontaktEmail: 'x'.repeat(201) + '@example.org' },
      { zeilen: [{ ...eingabe().zeilen[0], veranstaltungsort: 'x'.repeat(121) }] },
      { zeilen: [{ ...eingabe().zeilen[0], speisen: [{ name: '', preis: '5' }] }] },
      { zeilen: [eingabe().zeilen[0], eingabe().zeilen[0]] },
    ]) {
      expect((await pruefeVorschlag({ ...eingabe(), ...extra } as VorschlagEingabe, orte)).ok).toBe(
        false,
      );
    }
    vi.mocked(orte.finde).mockResolvedValue(null);
    expect((await pruefeVorschlag(eingabe(), orte)).ok).toBe(false);
  });
  it('nur gültige Redaktionssitzungen dürfen lesen oder bearbeiten', async () => {
    const { v, sitzungen, repo } = setup();
    for (const t of ['', 'abgelaufen']) {
      vi.mocked(sitzungen.pruefe).mockResolvedValue(null);
      for (const r of [
        await v.liste(t),
        await v.anzahl(t),
        await v.finde(t, ID),
        await v.uebernehme(t, ID, eingabe()),
        await v.lehneAb(t, ID),
      ])
        expect(r).toEqual({ ok: false, error: 'VERBOTEN' });
    }
    expect(repo.uebernehme).not.toHaveBeenCalled();
  });
  it('Redaktion und Admin dürfen Liste, Anzahl und offene Vorschläge lesen', async () => {
    const { v, repo, sitzungen } = setup();
    expect(await v.liste('token')).toEqual({ ok: true, value: [] });
    expect(await v.anzahl('token')).toEqual({ ok: true, value: 2 });
    vi.mocked(sitzungen.pruefe).mockResolvedValue({ adminId: '2', name: 'Admin', rolle: 'admin' });
    vi.mocked(repo.finde).mockResolvedValue({ id: ID } as never);
    expect(await v.finde('token', ID)).toEqual({ ok: true, value: { id: ID } });
  });
  it('ungültige, unbekannte oder erledigte Vorschläge ergeben nicht gefunden', async () => {
    const { v, repo } = setup();
    for (const id of ['ungueltig', ID]) {
      expect(await v.finde('token', id)).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
      expect(await v.uebernehme('token', id, eingabe())).toEqual({
        ok: false,
        error: 'NICHT_GEFUNDEN',
      });
    }
    vi.mocked(repo.lehneAb).mockResolvedValue(false);
    expect(await v.lehneAb('token', ID)).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect(await v.lehneAb('token', 'bad')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
  });
  it('übernimmt ausschließlich neu validierte Termine atomar mit Admin-ID – Redaktion nie „bestätigt“ (#240)', async () => {
    const { v, repo } = setup();
    vi.mocked(repo.finde).mockResolvedValue({ id: ID } as never);
    expect(await v.uebernehme('token', ID, eingabe())).toEqual({ ok: true, value: true });
    expect(repo.uebernehme).toHaveBeenCalledWith(
      ID,
      [expect.objectContaining({ bestaetigt: false })],
      '1',
    );
    expect((await v.uebernehme('token', ID, { ...eingabe(), zeilen: [] })).ok).toBe(false);
    vi.mocked(repo.uebernehme).mockResolvedValueOnce('KONFLIKT');
    expect(await v.uebernehme('token', ID, eingabe())).toEqual({
      ok: false,
      error: 'KONFLIKT',
    });
    vi.mocked(repo.uebernehme).mockResolvedValue(false);
    expect(await v.uebernehme('token', ID, eingabe())).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
  });
  it('Ablehnen begrenzt und bereinigt Grund; Kontaktdaten gelangen nie ins Audit', async () => {
    const { v, repo } = setup();
    expect((await v.lehneAb('token', ID, 'x'.repeat(501))).ok).toBe(false);
    expect(await v.lehneAb('token', ID, ' Falsches\u0000 Datum ')).toEqual({
      ok: true,
      value: true,
    });
    expect(repo.lehneAb).toHaveBeenCalledWith(ID, 'Falsches  Datum', '1');
    await v.lehneAb('token', ID);
    expect(repo.lehneAb).toHaveBeenCalledWith(ID, null, '1');
  });
});

describe('Kartenlink beim Melden (Issue #169)', () => {
  const APOSTEL =
    'https://www.google.com/maps/place/Gastst%C3%A4tte+Zum+einkehrenden+Apostel/@50.8603992,11.0904561,750m/data=!3m2!1e3!4b1!8m2!3d50.8603992!4d11.093031?entry=ttu';
  it.each([
    [APOSTEL, true],
    ['https://www.google.de/maps/@50.86,11.09,17z', true],
    ['https://maps.google.com/maps?q=50.86,11.09', true],
    ['https://maps.app.goo.gl/AbC123xyz', true],
    ['https://goo.gl/maps/AbC123', true],
    ['50.8604, 11.0930', true],
    ['http://www.google.com/maps/@50.86,11.09,17z', false],
    ['https://evil.example/maps/@50.86,11.09', false],
    ['https://www.google.com.evil.example/maps/@50.86,11.09', false],
    ['https://www.google.com@evil.example/maps/', false],
    ['https://user:pw@www.google.com/maps/', false],
    ['https://www.google.com:8443/maps/', false],
    ['https://www.google.com/search?q=maps', false],
    ['https://www.google.com/url?q=https://evil.example', false],
    ['https://maps.app.goo.gl/AbC/../../x', false],
    ['javascript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['https://www.google.com/maps/\u0000', false],
    ['https://www.google.com/maps/ x', false],
    [`https://www.google.com/maps/${'a'.repeat(2000)}`, false],
    ['', false],
  ])('%s → %s', (link, erlaubt) => expect(istErlaubterKartenlink(link)).toBe(erlaubt));

  const orte = {
    finde: async () => ({ slug: 'elleben', name: 'Elleben', landkreis: 'IK', koordinate: null }),
    liste: async () => [],
  } as never;
  const mit = (z: object) => ({
    ortSlug: 'elleben',
    zeilen: [{ datum: '2027-09-17', titel: 'Frühschoppen', ...z }],
  });
  const fehlermeldungen = (r: { ok: boolean; error?: unknown }) =>
    r.ok ? [] : (r.error as { meldung: string }[]).map((f) => f.meldung);

  it('nur Koordinaten und Name werden übernommen, nie der Link', async () => {
    const r = await pruefeVorschlag(mit({ karte: APOSTEL }), orte);
    expect(r.ok).toBe(true);
    const t = r.ok ? r.value.termine[0] : null;
    expect(t?.platz).toEqual({ lat: 50.860399, lon: 11.093031 }); // auf ~10 cm gerundet
    expect(t?.veranstaltungsort).toBe('Gaststätte Zum einkehrenden Apostel');
    expect(JSON.stringify(r)).not.toContain('google');
    expect(t?.platzUebernehmen).toBe(false);
  });
  it('Kurzlink wird über den sicheren Auflöser gelesen', async () => {
    const aufloesen = vi.fn(async () => APOSTEL);
    const r = await pruefeVorschlag(
      mit({ karte: 'https://maps.app.goo.gl/Abc', veranstaltungsort: 'Saal' }),
      orte,
      { karten: { aufloesen } },
    );
    expect(aufloesen).toHaveBeenCalledWith('https://maps.app.goo.gl/Abc');
    expect(r.ok && r.value.termine[0]?.veranstaltungsort).toBe('Saal');
    const nichts = await pruefeVorschlag(mit({ karte: 'https://maps.app.goo.gl/Abc' }), orte, {
      karten: { aufloesen: async () => null },
    });
    expect(fehlermeldungen(nichts)[0]).toContain('nicht erkannt');
  });
  it.each([
    ['https://evil.example/maps/@50.86,11.09', 'nur einen Link aus Google Maps'],
    ['https://www.google.com/maps/@52.52,13.40,17z', 'nicht in Thüringen'],
    ['50.86, 11.09', '„Wo genau?“ ausfüllen'],
  ])('abgelehnt: %s', async (karte, meldung) => {
    expect(fehlermeldungen(await pruefeVorschlag(mit({ karte }), orte))[0]).toContain(meldung);
  });
  it('öffentlich gesendete Punkte werden ignoriert, die Redaktion prüft gespeicherte', async () => {
    const oeffentlich = await pruefeVorschlag(
      mit({ platz: { lat: 50.9, lon: 11 }, platzUebernehmen: true, veranstaltungsort: 'Kirche' }),
      orte,
    );
    expect(oeffentlich.ok && oeffentlich.value.termine[0]?.platz).toBeNull();
    const redaktion = await pruefeVorschlag(
      mit({ platz: { lat: 50.9, lon: 11 }, platzUebernehmen: true, veranstaltungsort: 'Kirche' }),
      orte,
      { redaktion: true },
    );
    expect(redaktion.ok && redaktion.value.termine[0]).toMatchObject({
      platz: { lat: 50.9, lon: 11 },
      platzUebernehmen: true,
    });
    const falsch = await pruefeVorschlag(mit({ platz: { lat: 1, lon: 2 } }), orte, {
      redaktion: true,
    });
    expect(fehlermeldungen(falsch)[0]).toContain('Kartenpunkt ungültig');
  });
});

describe('Mail zum neuen Vorschlag (Issue #171)', () => {
  const termin = (datum: string, beginn: string | null, titel: string, extra = {}) =>
    ({
      ortSlug: 'elleben',
      landkreis: 'IK',
      datum,
      beginn,
      titel,
      veranstaltungsort: null,
      kategorie: 'party',
      bestaetigt: false,
      speisen: [],
      platz: null,
      ...extra,
    }) as never;
  const v = {
    ortSlug: 'elleben',
    kontaktName: 'KG Elleben',
    kontaktEmail: 'kg@example.org',
    nachricht: 'Bitte Band ergänzen.',
    termine: [
      termin('2027-09-17', '18:00', 'Kirmesgottesdienst', {
        veranstaltungsort: 'Kirche',
        platz: { lat: 50.86, lon: 11.09 },
      }),
      termin('2027-09-18', '20:00', 'Kirmestanz', { band: 'Belconda' }),
    ],
  };
  it('Betreff und Programm mit Wochentag, direkter Link', () => {
    const m = vorschlagsMail(v, { name: 'Elleben', landkreis: 'IK' }, 'abc-123', 'https://k.de/');
    expect(m.betreff).toBe(
      'Neuer Kirmesvorschlag: Elleben (IK) – 2 Veranstaltungen ab Fr., 17.09.2027',
    );
    expect(m.text).toBe(
      [
        'Neuer Vorschlag für Elleben (Ilm-Kreis)',
        '',
        'Programm:',
        '- Fr., 17.09.2027, 18:00 Uhr – Kirmesgottesdienst (Kirche · Kartenpunkt)',
        '- Sa., 18.09.2027, 20:00 Uhr – Kirmestanz (Band/DJ: Belconda)',
        '',
        'Eingereicht von: KG Elleben – „Antworten“ geht direkt an den Einsender',
        '',
        'Nachricht:',
        'Bitte Band ergänzen.',
        '',
        'Jetzt prüfen und übernehmen:',
        'https://k.de/admin/kirmes-eintragen?vorschlag=abc-123',
        '',
        'Alle offenen Vorschläge: https://k.de/admin/vorschlaege',
      ].join('\n'),
    );
  });
  it('ohne Kontakt, eine Veranstaltung, lange Nachricht gekürzt', () => {
    const m = vorschlagsMail(
      {
        ...v,
        kontaktName: null,
        kontaktEmail: null,
        nachricht: 'x'.repeat(600),
        termine: [termin('2027-09-19', null, 'Frühschoppen', { speisen: [{ name: 'Bier' }] })],
      },
      { name: 'Elleben', landkreis: 'XX' },
      'id',
      'https://k.de',
    );
    expect(m.betreff).toContain('– 1 Veranstaltung ab So., 19.09.2027');
    expect(m.text).toContain('Neuer Vorschlag für Elleben (XX)');
    expect(m.text).toContain('- So., 19.09.2027 – Frühschoppen (Essen & Getränke)');
    expect(m.text).toContain('Eingereicht von: ohne Namen\n');
    expect(m.text).toContain(`${'x'.repeat(500)} …`);
  });
});

describe('Mail zum neuen Vorschlag – Grenzfälle (Issue #171)', () => {
  it('ohne Nachricht keine Nachrichtzeilen, ohne Termine kein „ab“', () => {
    const m = vorschlagsMail(
      { ortSlug: 'x', kontaktName: 'A', kontaktEmail: null, nachricht: null, termine: [] },
      { name: 'X', landkreis: 'GTH' },
      'id',
      'https://k.de',
    );
    expect(m.betreff).toBe('Neuer Kirmesvorschlag: X (GTH) – 0 Veranstaltungen');
    expect(m.text).not.toContain('Nachricht:');
    expect(m.text).toContain('(Gotha)');
  });
  it('erlaubt keinen Link ohne Pfad', () => {
    expect(istErlaubterKartenlink('https://www.google.com')).toBe(false);
  });
});

describe('Mail beim Melden (Issue #171)', () => {
  it('nennt Ort, Kreis und Direktlink; fällt ohne Ortsdaten auf den Slug zurück', async () => {
    const { v, post, orte } = setup();
    expect((await v.melde(eingabe(), 'ip')).ok).toBe(true);
    expect(post.sende).toHaveBeenLastCalledWith(
      expect.objectContaining({
        betreff: expect.stringContaining('Alkersleben (IK) – 1 Veranstaltung ab Fr., 17.09.2027'),
        text: expect.stringContaining(
          'https://example.org/admin/kirmes-eintragen?vorschlag=11111111-2222-4333-8444-555555555555',
        ),
      }),
    );
    vi.mocked(orte.finde)
      .mockResolvedValueOnce({
        slug: 'alkersleben',
        name: 'Alkersleben',
        landkreis: 'IK',
        koordinate: null,
      })
      .mockResolvedValueOnce(null);
    await v.melde(eingabe(), 'ip');
    expect(post.sende).toHaveBeenLastCalledWith(
      expect.objectContaining({ betreff: expect.stringContaining('alkersleben () – 1') }),
    );
  });
});

describe('Mail: Gottesdienst mit Chor und Pfarrer/in (Issue #175)', () => {
  it('nennt Musik und Pfarrer/in', () => {
    const m = vorschlagsMail(
      {
        ortSlug: 'x',
        kontaktName: null,
        kontaktEmail: null,
        nachricht: null,
        termine: [
          {
            ortSlug: 'x',
            landkreis: 'IK',
            datum: '2027-09-17',
            beginn: '10:00',
            titel: 'Kirmesgottesdienst',
            veranstaltungsort: null,
            kategorie: 'tradition',
            bestaetigt: false,
            band: 'Kirchenchor',
            pfarrer: 'Pfarrer Muster',
            info: null,
            muttizettel: false,
            speisen: [],
            platz: null,
          } as never,
        ],
      },
      { name: 'X', landkreis: 'IK' },
      'id',
      'https://k.de',
    );
    expect(m.text).toContain(
      'Kirmesgottesdienst (Musik: Kirchenchor · Pfarrer/in: Pfarrer Muster)',
    );
  });
});

describe('Vorschläge für die Kirmesgesellschaft (Issue #180)', () => {
  it('nur eigener Ort: Liste, Anzahl, Ansehen, Übernehmen, Ablehnen', async () => {
    const { v, repo, sitzungen } = setup();
    vi.mocked(sitzungen.pruefe).mockResolvedValue({
      adminId: '9',
      name: 'KG',
      rolle: 'kirmesgesellschaft',
      ortSlug: 'alkersleben',
    });
    const eigen = { id: ID, ortSlug: 'alkersleben' } as never;
    const fremd = { id: 'ab000000-0000-4000-8000-000000000002', ortSlug: 'erfurt' } as never;
    vi.mocked(repo.liste).mockResolvedValue([eigen, fremd]);
    expect(await v.liste('kg')).toEqual({ ok: true, value: [eigen] });
    expect(await v.anzahl('kg')).toEqual({ ok: true, value: 1 });
    vi.mocked(repo.finde).mockResolvedValue(fremd);
    expect(await v.finde('kg', 'ab000000-0000-4000-8000-000000000002')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect(await v.lehneAb('kg', 'ab000000-0000-4000-8000-000000000002')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect(await v.uebernehme('kg', 'ab000000-0000-4000-8000-000000000002', eingabe())).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    vi.mocked(repo.finde).mockResolvedValue(eigen);
    expect((await v.finde('kg', ID)).ok).toBe(true);
    expect((await v.lehneAb('kg', ID)).ok).toBe(true);
    // eigener Vorschlag, aber Übernahme in fremden Ort umgeschrieben → nein
    expect(await v.uebernehme('kg', ID, { ...eingabe(), ortSlug: 'erfurt' })).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    // Kirmesgesellschaft übernimmt den Vorschlag ihres Ortes → bestätigt (Issue #240)
    vi.mocked(repo.uebernehme).mockClear();
    expect((await v.uebernehme('kg', ID, eingabe())).ok).toBe(true);
    expect(vi.mocked(repo.uebernehme).mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ bestaetigt: true }),
    ]);
  });
});
