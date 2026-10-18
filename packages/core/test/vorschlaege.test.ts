import { describe, expect, it, vi } from 'vitest';
import {
  Vorschlaege,
  pruefeVorschlag,
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
    lege: vi.fn(async () => true),
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
            kategorie: 'tradition',
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
        await v.uebernehme(t, ID, eingabe(), false),
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
      expect(await v.uebernehme('token', id, eingabe(), true)).toEqual({
        ok: false,
        error: 'NICHT_GEFUNDEN',
      });
    }
    vi.mocked(repo.lehneAb).mockResolvedValue(false);
    expect(await v.lehneAb('token', ID)).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect(await v.lehneAb('token', 'bad')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
  });
  it('übernimmt ausschließlich neu validierte Termine atomar mit Admin-ID und bewusster Bestätigung', async () => {
    const { v, repo } = setup();
    vi.mocked(repo.finde).mockResolvedValue({ id: ID } as never);
    expect(await v.uebernehme('token', ID, eingabe(), true)).toEqual({ ok: true, value: true });
    expect(repo.uebernehme).toHaveBeenCalledWith(
      ID,
      [expect.objectContaining({ bestaetigt: true })],
      '1',
    );
    expect((await v.uebernehme('token', ID, { ...eingabe(), zeilen: [] }, false)).ok).toBe(false);
    vi.mocked(repo.uebernehme).mockResolvedValueOnce('KONFLIKT');
    expect(await v.uebernehme('token', ID, eingabe(), false)).toEqual({
      ok: false,
      error: 'KONFLIKT',
    });
    vi.mocked(repo.uebernehme).mockResolvedValue(false);
    expect(await v.uebernehme('token', ID, eingabe(), false)).toEqual({
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
