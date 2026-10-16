/** Ersten Redaktionszugang im Browser einrichten (Issue #48). */
import { describe, expect, it } from 'vitest';
import {
  Ersteinrichtung,
  SITZUNG_STUNDEN,
  type Einrichtungslinks,
  type Nachricht,
  type Validierungsfehler,
} from '../src/index.js';

function aufbau({ adminVorhanden = false, erlaubt = true } = {}) {
  const admins: { email: string; hash: string; totp: string }[] = adminVorhanden
    ? [{ email: 'alt@example.org', hash: 'h', totp: 'T' }]
    : [];
  const post: Nachricht[] = [];
  const sitzungen: { adminId: string; token: string }[] = [];
  const offeneLinks = new Map<string, string>();
  let n = 0;
  const links: Einrichtungslinks = {
    lege: (g) => {
      const l = `link-${++n}`;
      offeneLinks.set(l, g);
      return l;
    },
    finde: (l) => (offeneLinks.has(l) ? { totpGeheimnis: offeneLinks.get(l)! } : null),
    verbrauche: (l) => void offeneLinks.delete(l),
  };
  let legeAnErgebnis: (() => string | null) | undefined;
  const e = new Ersteinrichtung(
    {
      gibtEs: async () => admins.length > 0,
      legeAn: async (email, hash, totp) => {
        if (legeAnErgebnis) return legeAnErgebnis();
        if (admins.length) return null;
        admins.push({ email, hash, totp });
        return '1';
      },
    },
    {
      hashePasswort: async (p) => `hash(${p})`,
      neuesTotpGeheimnis: () => 'GEHEIMNIS',
      pruefeEinmalcode: (g, c) => g === 'GEHEIMNIS' && c === '123456',
      neuesToken: () => 'sitzungstoken',
    },
    links,
    { sende: async (m) => void post.push(m) },
    { erlaube: () => erlaubt },
    {
      lege: async (adminId, token) => void sitzungen.push({ adminId, token }),
      pruefe: async () => null,
      beende: async () => {},
    },
    'https://kirmes.example/',
  );
  const setzeLegeAn = (f: () => string | null) => (legeAnErgebnis = f);
  return { e, admins, post, sitzungen, offeneLinks, setzeLegeAn };
}

const gueltig = {
  email: ' Redaktion@Example.org ',
  passwort: 'ein-langes-passwort',
  passwortWiederholung: 'ein-langes-passwort',
  code: ' 123456 ',
};

describe('Ersteinrichtung', () => {
  it('ist offen, solange es keinen Admin gibt', async () => {
    expect(await aufbau().e.offen()).toBe(true);
    expect(await aufbau({ adminVorhanden: true }).e.offen()).toBe(false);
  });

  it('schickt den Link an das Redaktionspostfach (ohne Reply-To)', async () => {
    const { e, post } = aufbau();
    expect((await e.sendeLink()).ok).toBe(true);
    expect(post).toHaveLength(1);
    expect(post[0]!.antwortAn).toBeUndefined();
    expect(post[0]!.text).toContain('https://kirmes.example/admin/einrichten?link=link-1');
  });

  it('sendet keinen Link, wenn schon eingerichtet oder zu viele Anfragen', async () => {
    const a = aufbau({ adminVorhanden: true });
    expect(await a.e.sendeLink()).toEqual({ ok: false, error: 'SCHON_EINGERICHTET' });
    const b = aufbau({ erlaubt: false });
    expect(await b.e.sendeLink()).toEqual({ ok: false, error: 'ZU_VIELE' });
    expect([...a.post, ...b.post]).toHaveLength(0);
  });

  it('zeigt das TOTP-Geheimnis nur für gültige Links', async () => {
    const { e } = aufbau();
    await e.sendeLink();
    expect(await e.pruefeLink('link-1')).toEqual({
      ok: true,
      value: { totpGeheimnis: 'GEHEIMNIS' },
    });
    expect(await e.pruefeLink('erfunden')).toEqual({ ok: false, error: 'LINK_UNGUELTIG' });
  });

  it('legt das Konto an, meldet direkt an und verbraucht den Link', async () => {
    const { e, admins, sitzungen, offeneLinks } = aufbau();
    await e.sendeLink();
    const r = await e.schliesseAb('link-1', gueltig);
    expect(r).toEqual({ ok: true, value: { token: 'sitzungstoken', stunden: SITZUNG_STUNDEN } });
    expect(admins).toEqual([
      { email: 'redaktion@example.org', hash: 'hash(ein-langes-passwort)', totp: 'GEHEIMNIS' },
    ]);
    expect(sitzungen).toEqual([{ adminId: '1', token: 'sitzungstoken' }]);
    expect(offeneLinks.size).toBe(0);
    // Ein zweiter Versuch mit demselben Link scheitert
    expect(await e.schliesseAb('link-1', gueltig)).toEqual({ ok: false, error: 'LINK_UNGUELTIG' });
  });

  it('prüft E-Mail, Passwortlänge, Wiederholung und Code', async () => {
    const { e, admins } = aufbau();
    await e.sendeLink();
    const codes = async (a: Partial<typeof gueltig>) => {
      const r = await e.schliesseAb('link-1', { ...gueltig, ...a });
      return r.ok ? [] : (r.error as Validierungsfehler[]).map((f) => f.code);
    };
    expect(await codes({ email: 'keine-mail' })).toEqual(['EMAIL']);
    expect(await codes({ passwort: 'kurz', passwortWiederholung: 'kurz' })).toEqual([
      'PASSWORT_KURZ',
    ]);
    expect(await codes({ passwortWiederholung: 'anders-anders-anders' })).toEqual([
      'PASSWORT_UNGLEICH',
    ]);
    expect(await codes({ code: '000000' })).toEqual(['CODE']);
    expect(admins).toHaveLength(0); // Link bleibt nach Eingabefehlern gültig
    expect((await e.schliesseAb('link-1', gueltig)).ok).toBe(true);
  });

  it('ist gesperrt, sobald ein Admin existiert – auch mit gültigem Link', async () => {
    const { e, admins } = aufbau();
    await e.sendeLink();
    admins.push({ email: 'schneller@example.org', hash: 'h', totp: 'T' });
    expect(await e.pruefeLink('link-1')).toEqual({ ok: false, error: 'SCHON_EINGERICHTET' });
    expect(await e.schliesseAb('link-1', gueltig)).toEqual({
      ok: false,
      error: 'SCHON_EINGERICHTET',
    });
  });

  it('meldet „schon eingerichtet“, wenn gleichzeitig jemand anderes abschließt', async () => {
    const { e, sitzungen, setzeLegeAn } = aufbau();
    await e.sendeLink();
    setzeLegeAn(() => null);
    expect(await e.schliesseAb('link-1', gueltig)).toEqual({
      ok: false,
      error: 'SCHON_EINGERICHTET',
    });
    expect(sitzungen).toHaveLength(0);
  });
});
