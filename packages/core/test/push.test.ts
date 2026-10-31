import { describe, expect, it } from 'vitest';
import {
  Benachrichtigungen,
  datumKurzText,
  PUSH_AUFBEWAHRUNG_TAGE,
  pushText,
  TerminVerwaltungMitPush,
  type NeuerTermin,
  type PushAblage,
  type PushAbo,
  type PushNachricht,
  type PushTermin,
  type PushZiel,
  type Termin,
  type TerminVerwaltung,
  type Zustellung,
} from '../src/index.js';

const ziel = (n: string): PushZiel => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  p256dh: 'BAbc',
  auth: 'xyz',
});
const abo = (x: Partial<PushAbo> = {}): PushAbo => ({
  ...ziel('a'),
  orte: ['muehlberg'],
  termine: [],
  erinnerung: true,
  ...x,
});
const pt = (x: Partial<PushTermin> = {}): PushTermin => ({
  id: 't1',
  titel: 'Kirmestanz',
  datum: '2026-11-07',
  beginn: '20:00',
  ortSlug: 'muehlberg',
  ortName: 'Mühlberg',
  veranstaltungsort: 'Festzelt',
  ...x,
});

function aufbau(antwort: (z: PushZiel) => Zustellung = () => 'zugestellt') {
  const gespeichert: PushAbo[] = [];
  const geloescht: string[] = [];
  const gesendet: { an: string; n: PushNachricht }[] = [];
  const empfaengerAufrufe: [string, readonly string[]][] = [];
  let aufgeraeumt = 0;
  const ablage: PushAblage = {
    speichere: async (a) => void gespeichert.push(a),
    loesche: async (e) => (geloescht.push(e), true),
    empfaenger: async (ort, ids) => (empfaengerAufrufe.push([ort, ids]), [ziel('x'), ziel('weg')]),
    erinnerungen: async (d) => [
      { ziel: ziel('x'), termine: [pt({ datum: d })] },
      {
        ziel: ziel('y'),
        termine: [pt({ datum: d }), pt({ id: 't2', beginn: null, titel: 'Disco' })],
      },
      { ziel: ziel('z'), termine: [] },
    ],
    raeumeAuf: async (t) => void (aufgeraeumt = t),
  };
  const push = new Benachrichtigungen(ablage, {
    sende: async (z, n) => (gesendet.push({ an: z.endpoint, n }), antwort(z)),
  });
  return {
    push,
    gespeichert,
    geloescht,
    gesendet,
    empfaengerAufrufe,
    aufgeraeumt: () => aufgeraeumt,
  };
}

describe('Push-Abos (Issue #348)', () => {
  it('nimmt nur Endpunkte der Push-Dienste an und prüft Schlüssel und Listen', async () => {
    const { push, gespeichert } = aufbau();
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/a',
      'https://web.push.apple.com/QK',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://wns2-db5p.notify.windows.com/w/?token=x',
    ])
      expect((await push.abonniere(abo({ endpoint }))).ok).toBe(true);
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/a',
      'https://fcm.googleapis.com.evil.example/x',
      'https://127.0.0.1/x',
      'https://example.org/push',
      `https://fcm.googleapis.com/${'x'.repeat(1001)}`,
    ])
      expect(await push.abonniere(abo({ endpoint }))).toEqual({ ok: false, error: 'ENDPUNKT' });
    expect(await push.abonniere(abo({ p256dh: 'a b' }))).toEqual({
      ok: false,
      error: 'SCHLUESSEL',
    });
    expect(await push.abonniere(abo({ auth: 'x'.repeat(101) }))).toEqual({
      ok: false,
      error: 'SCHLUESSEL',
    });
    expect(await push.abonniere(abo({ orte: ['Nicht Gültig'] }))).toEqual({
      ok: false,
      error: 'LISTE',
    });
    expect(await push.abonniere(abo({ termine: ['keine-uuid'] }))).toEqual({
      ok: false,
      error: 'LISTE',
    });
    expect(
      await push.abonniere(abo({ orte: Array.from({ length: 51 }, (_, i) => `o${i}`) })),
    ).toEqual({
      ok: false,
      error: 'LISTE',
    });
    // doppelte Einträge fallen weg, IDs klein
    const id = 'AAAAAAAA-0000-4000-8000-000000000000';
    await push.abonniere(abo({ orte: ['a', 'a'], termine: [id, id.toLowerCase()] }));
    expect(gespeichert.at(-1)).toMatchObject({ orte: ['a'], termine: [id.toLowerCase()] });
  });

  it('abmelden und aufräumen', async () => {
    const { push, geloescht, aufgeraeumt } = aufbau();
    expect(await push.abmelden('https://fcm.googleapis.com/x')).toBe(true);
    expect(geloescht).toEqual(['https://fcm.googleapis.com/x']);
    await push.raeumeAuf();
    expect(aufgeraeumt()).toBe(PUSH_AUFBEWAHRUNG_TAGE);
  });
});

describe('Nachrichten (Issue #348)', () => {
  it('neu: einzeln oder gesammelt je Ort; abgemeldete Geräte fliegen raus', async () => {
    const { push, gesendet, geloescht } = aufbau((z) =>
      z.endpoint.endsWith('weg') ? 'abgemeldet' : 'zugestellt',
    );
    expect(
      await push.neu([
        pt(),
        pt({ id: 't2', ortSlug: 'ulla', ortName: 'Ulla' }),
        pt({ id: 't3', ortSlug: 'ulla', ortName: 'Ulla' }),
      ]),
    ).toBe(2);
    expect(gesendet.map((g) => g.n.titel)).toEqual([
      'Neu: Kirmestanz in Mühlberg',
      'Neu: Kirmestanz in Mühlberg',
      '2 neue Termine in Ulla',
      '2 neue Termine in Ulla',
    ]);
    expect(gesendet[0]?.n).toMatchObject({
      text: 'Sa., 7.11. um 20:00 Uhr – Mühlberg (Festzelt)',
      url: '/termin/t1',
    });
    expect(gesendet[2]?.n.url).toBe('/orte/ulla');
    expect(geloescht).toEqual([gesendet[1]?.an, gesendet[3]?.an]);
  });

  it('geändert an Folgende und Merkende; abgesagt an vorab gelesene Empfänger', async () => {
    const { push, gesendet, empfaengerAufrufe } = aufbau((z) =>
      z.endpoint.endsWith('weg') ? 'fehler' : 'zugestellt',
    );
    expect(await push.geaendert(pt({ beginn: null, veranstaltungsort: null }))).toBe(1);
    expect(empfaengerAufrufe).toEqual([['muehlberg', ['t1']]]);
    expect(gesendet[0]?.n).toMatchObject({
      titel: 'Geändert: Kirmestanz in Mühlberg',
      text: 'Jetzt Sa., 7.11. – Mühlberg',
    });
    expect(await push.abgesagt([ziel('a')], pt())).toBe(1);
    expect(gesendet.at(-1)?.n).toMatchObject({
      titel: 'Abgesagt: Kirmestanz in Mühlberg',
      url: '/orte/muehlberg',
    });
  });

  it('Erinnerung am Vortag: ein Termin oder mehrere, leere Listen still', async () => {
    const { push, gesendet } = aufbau();
    expect(await push.erinnere('2026-11-07')).toBe(2);
    expect(gesendet.map((g) => g.n.titel)).toEqual([
      'Morgen: Kirmestanz in Mühlberg',
      'Morgen 2× Kirmes',
    ]);
    expect(gesendet[0]?.n.text).toBe('Ab 20:00 Uhr – Mühlberg (Festzelt)');
    expect(gesendet[1]?.n).toMatchObject({
      url: '/gemerkt',
      text: '20:00 Kirmestanz (Mühlberg) · Disco (Mühlberg)',
    });
    expect(pushText.erinnerung([pt({ beginn: null })]).text).toBe('Mühlberg (Festzelt)');
  });

  it('Datum kurz', () => {
    expect(datumKurzText('2026-11-01')).toBe('So., 1.11.');
    expect(pushText.mehrereNeu([]).titel).toBe('0 neue Termine in ');
    expect(pushText.erinnerung([]).tag).toBe('erinnerung-');
  });
});

describe('Auslöser an der Terminverwaltung (Issue #348)', () => {
  const termin = (x: Partial<Termin> = {}): Termin =>
    ({
      id: 't1',
      datum: '2026-11-07',
      beginn: '20:00',
      titel: 'Kirmestanz',
      veranstaltungsort: 'Festzelt',
      ort: { slug: 'muehlberg', name: 'Mühlberg' },
      ...x,
    }) as Termin;
  const neu = (x: Partial<NeuerTermin> = {}): NeuerTermin =>
    ({
      datum: '2026-11-07',
      beginn: '20:00',
      titel: 'Kirmestanz',
      veranstaltungsort: 'Festzelt',
      ...x,
    }) as NeuerTermin;

  function rahmen(o: { erfolg?: boolean; vorhanden?: Record<string, Termin> } = {}) {
    const erfolg = o.erfolg ?? true;
    const vorhanden = new Map(Object.entries(o.vorhanden ?? { t1: termin() }));
    const meldungen: string[] = [];
    const push = {
      neu: async (ts: PushTermin[]) => (meldungen.push(`neu ${ts.map((t) => t.id).join(',')}`), 1),
      geaendert: async (t: PushTermin) => (meldungen.push(`geaendert ${t.id}`), 1),
      abgesagt: async (z: PushZiel[], t: PushTermin) => (
        meldungen.push(`abgesagt ${t.id} an ${z.length}`),
        1
      ),
      empfaengerFuer: async () => [ziel('a'), ziel('b')],
    } as unknown as Benachrichtigungen;
    const innen = {
      lege: async (t: NeuerTermin) => termin({ id: 'n1', datum: t.datum }),
      legeAlle: async (ts: NeuerTermin[]) =>
        ts.map((t, i) => termin({ id: `n${i}`, datum: t.datum })),
      aendere: async () => erfolg,
      aendereAlle: async () => erfolg,
      setzeSpeisen: async () => true,
      bestaetige: async () => true,
      loesche: async (id: string) => (vorhanden.delete(id), erfolg),
    } as unknown as TerminVerwaltung;
    const v = new TerminVerwaltungMitPush(
      innen,
      { finde: async (id) => vorhanden.get(id) ?? null },
      push,
      () => '2026-11-01',
    );
    return { v, meldungen };
  }
  const durch = { ortSlug: 'muehlberg' } as never;

  it('neu: nur kommende Termine', async () => {
    const { v, meldungen } = rahmen();
    await v.lege(neu(), durch);
    await v.lege(neu({ datum: '2026-10-01' }), durch);
    await v.legeAlle([neu(), neu({ datum: '2026-10-01' })], durch);
    await v.legeAlle([neu({ datum: '2026-10-01' })], durch);
    await v.fertig();
    expect(meldungen).toEqual(['neu n1', 'neu n0']);
  });

  it('geändert: nur bei Datum, Uhrzeit, Titel oder Ort – nicht bei Hinweisen, nicht vergangen', async () => {
    const { v, meldungen } = rahmen();
    await v.aendere('t1', neu({ info: 'anders' } as never), durch);
    await v.aendere('t1', neu({ beginn: '21:00' }), durch);
    await v.aendere('t1', neu({ beginn: null, datum: '2026-10-01' }), durch);
    await v.aendere('fehlt', neu({ titel: 'Neu' }), durch);
    await v.fertig();
    expect(meldungen).toEqual(['geaendert t1']);
    for (const x of [{ titel: 'Disco' }, { datum: '2026-11-08' }, { veranstaltungsort: null }])
      await v.aendere('t1', neu(x), durch);
    await v.fertig();
    expect(meldungen).toHaveLength(4);
  });

  it('Sammeländerung: Absagen an vorab gelesene Empfänger, Änderungen wie einzeln', async () => {
    const { v, meldungen } = rahmen({
      vorhanden: {
        t1: termin(),
        t2: termin({ id: 't2' }),
        alt: termin({ id: 'alt', datum: '2026-01-01' }),
      },
    });
    expect(
      await v.aendereAlle(
        [
          { id: 't1', termin: neu({ beginn: '22:00' }) },
          { id: 'fehlt', termin: neu() },
          { id: 't2', termin: neu() },
        ],
        ['t2', 'alt', 'weg'],
        durch,
      ),
    ).toBe(true);
    await v.fertig();
    expect(meldungen).toEqual(['abgesagt t2 an 2', 'geaendert t1']);
  });

  it('Löschen: Empfänger vorher, Nachricht nachher; Fehlschlag meldet nichts', async () => {
    const ok1 = rahmen();
    expect(await ok1.v.loesche('t1', durch)).toBe(true);
    await ok1.v.fertig();
    expect(ok1.meldungen).toEqual(['abgesagt t1 an 2']);
    const nein = rahmen({ erfolg: false });
    await nein.v.loesche('t1', durch);
    await nein.v.aendere('t1', neu({ beginn: '21:00' }), durch);
    await nein.v.aendereAlle([], ['t1'], durch);
    await nein.v.loesche('fehlt', durch);
    await nein.v.fertig();
    expect(nein.meldungen).toEqual([]);
    expect(await nein.v.setzeSpeisen('t1', [], durch)).toBe(true);
    expect(await nein.v.bestaetige('t1', durch)).toBe(true);
  });

  it('Fehler beim Versand halten die Antwort nicht auf', async () => {
    const { v } = rahmen();
    (v as unknown as { push: { neu: () => Promise<never> } }).push.neu = async () => {
      throw new Error('Push-Dienst weg');
    };
    await expect(v.lege(neu(), durch)).resolves.toMatchObject({ id: 'n1' });
    await expect(v.fertig()).resolves.toBeUndefined();
  });
});
