import { describe, expect, it } from 'vitest';
import { MeldeAnRedaktion, type MeldungEingabe, type Nachricht } from '../src/index.js';

function aufbau(limitJe = 3, limitGesamt = 100) {
  const gesendet: Nachricht[] = [];
  const zaehler = new Map<string, number>();
  const drossel = (max: number) => ({
    erlaube: (k: string) => {
      const n = (zaehler.get(k) ?? 0) + 1;
      zaehler.set(k, n);
      return n <= max;
    },
  });
  const m = new MeldeAnRedaktion(
    { sende: async (n) => void gesendet.push(n) },
    drossel(limitJe),
    drossel(limitGesamt),
  );
  return { m, gesendet };
}

const termin: MeldungEingabe = {
  art: 'termin',
  ort: 'Mühlberg',
  landkreis: 'Gotha',
  datum: '2026-10-17',
  zeit: '20:00',
  titel: 'Kirmestanz',
  veranstaltungsort: 'Festzelt',
  info: 'Band: Belconda\nEintritt 8 €',
  absender: 'KG Mühlberg',
  email: 'kg@muehlberg.de',
  dauerMs: 20_000,
};

describe('Mitmach-Anfragen werden gespeichert (Issue #279)', () => {
  it('nur Art „mitmachen“, bereinigt, nicht bei Bots', async () => {
    const gespeichert: unknown[] = [];
    const m = new MeldeAnRedaktion(
      { sende: async () => {} },
      { erlaube: () => true },
      { erlaube: () => true },
      { lege: async (a, max) => (gespeichert.push({ ...a, max }), true) },
    );
    const basis = {
      art: 'mitmachen' as const,
      absender: ' Jo ',
      email: 'jo@example.org',
      dauerMs: 9000,
    };
    await m.melde({ ...basis, ort: '', info: ' Hallo\r\nWelt ' }, 'a');
    await m.melde({ ...basis, ort: 'Ilm-Kreis' }, 'b');
    await m.melde({ ...basis, ort: '', falle: 'bot' }, 'c');
    await m.melde(termin, 'd');
    expect(gespeichert).toEqual([
      { name: 'Jo', email: 'jo@example.org', ort: null, info: 'Hallo\nWelt', max: 200 },
      { name: 'Jo', email: 'jo@example.org', ort: 'Ilm-Kreis', info: null, max: 200 },
    ]);
  });
});

describe('Meldung an die Redaktion', () => {
  it('schickt eine Terminmeldung mit Antwortadresse der meldenden Person', async () => {
    const { m, gesendet } = aufbau();
    expect(await m.melde(termin, '1.2.3.4')).toEqual({ ok: true, value: { gesendet: true } });
    expect(gesendet[0]).toMatchObject({
      betreff: 'Terminmeldung: Kirmestanz in Mühlberg am 2026-10-17',
      antwortAn: 'kg@muehlberg.de',
    });
    expect(gesendet[0]?.text).toContain('Veranstaltungsort: Festzelt');
    expect(gesendet[0]?.text).toContain('Band: Belconda\nEintritt 8 €');
  });

  it('Link-Anfrage braucht kein Datum und keine Veranstaltung', async () => {
    const { m, gesendet } = aufbau();
    const r = await m.melde(
      { art: 'link', ort: 'Ulla', absender: 'KG Ulla', email: 'kg@ulla.de', dauerMs: 9000 },
      'ip',
    );
    expect(r.ok).toBe(true);
    expect(gesendet[0]?.betreff).toBe('Link für den Festplatz: Ulla');
  });

  it('Mitmachen-Anfrage: ohne Ort möglich, Antwortadresse der anfragenden Person', async () => {
    const { m, gesendet } = aufbau();
    const ohne = await m.melde(
      { art: 'mitmachen', ort: '', absender: 'Moni', email: 'moni@example.org', dauerMs: 9000 },
      'ip',
    );
    expect(ohne.ok).toBe(true);
    expect(gesendet[0]).toMatchObject({
      betreff: 'Mitmachen in der Redaktion: Moni',
      antwortAn: 'moni@example.org',
    });
    expect(gesendet[0]?.text).toContain('unter „Anfragen“');
    await m.melde(
      {
        art: 'mitmachen',
        ort: 'Ilm-Kreis',
        info: 'Ich kenne viele Kirmesgesellschaften.',
        absender: 'Jo',
        email: 'jo@example.org',
        dauerMs: 9000,
      },
      'ip2',
    );
    expect(gesendet[1]?.text).toContain('Region / Ort: Ilm-Kreis');
    expect(gesendet[1]?.text).toContain('Ich kenne viele Kirmesgesellschaften.');
    const ohneName = await m.melde(
      { art: 'mitmachen', ort: '', absender: '', email: 'x@y.de', dauerMs: 9000 },
      'ip3',
    );
    expect(!ohneName.ok && ohneName.error).toEqual([
      expect.objectContaining({ feld: 'absender', meldung: 'Name fehlt.' }),
    ]);
  });

  it('prüft Pflichtfelder, Datum, Uhrzeit, E-Mail und Längen', async () => {
    const { m, gesendet } = aufbau();
    const r = await m.melde(
      {
        ...termin,
        ort: '',
        datum: '2026-02-30',
        zeit: '25:00',
        email: 'keine-mail',
        titel: 'x'.repeat(201),
      },
      'ip',
    );
    expect(!r.ok && Array.isArray(r.error) && r.error.map((f) => f.feld)).toEqual([
      'ort',
      'titel',
      'email',
      'datum',
      'zeit',
    ]);
    expect(gesendet).toHaveLength(0);
  });

  it('kein Header-Injection: Zeilenumbrüche im Betreff werden entfernt', async () => {
    const { m, gesendet } = aufbau();
    await m.melde({ ...termin, titel: 'Tanz\r\nBcc: opfer@example.com' }, 'ip');
    expect(gesendet[0]?.betreff).toBe(
      'Terminmeldung: Tanz Bcc: opfer@example.com in Mühlberg am 2026-10-17',
    );
    expect(gesendet[0]?.betreff).not.toMatch(/[\r\n]/);
    const mail = await aufbau().m.melde({ ...termin, email: 'a@b.de\nBcc: x@y.de' }, 'ip');
    expect(mail.ok).toBe(false);
  });

  it('Spam-Falle und zu schnelles Absenden: still verworfen', async () => {
    const { m, gesendet } = aufbau();
    expect(await m.melde({ ...termin, falle: 'https://spam' }, 'ip')).toEqual({
      ok: true,
      value: { gesendet: false },
    });
    expect((await m.melde({ ...termin, dauerMs: 800 }, 'ip')).ok).toBe(true);
    expect(gesendet).toHaveLength(0);
  });

  it('begrenzt Meldungen je Absender und insgesamt', async () => {
    const je = aufbau(2);
    await je.m.melde(termin, 'a');
    await je.m.melde(termin, 'a');
    expect(await je.m.melde(termin, 'a')).toEqual({ ok: false, error: 'ZU_VIELE' });
    expect((await je.m.melde(termin, 'b')).ok).toBe(true);
    const gesamt = aufbau(10, 1);
    await gesamt.m.melde(termin, 'a');
    expect((await gesamt.m.melde(termin, 'b')).ok).toBe(false);
  });
});
