/** Redaktion nur mit Passkey: Registrierung, Einladung, Ersteinrichtung, Mitglieder (Issue #56). */
import { describe, expect, it } from 'vitest';
import {
  Beitritt,
  Ersteinrichtung,
  Mitgliederverwaltung,
  Registrierung,
  type Anlagebedingung,
  type Challenges,
  type EinladungInfo,
  type Mitglied,
  type Nachricht,
  type NeuesKonto,
  type Rolle,
  type Sitzung,
  type Validierungsfehler,
  type WebAuthn,
} from '../src/index.js';

/** Gemeinsame Fakes: WebAuthn-Antworten sind { cred, ok } */
function aufbau() {
  const konten: (NeuesKonto & { id: string; cred: string })[] = [];
  const sitzungen: string[] = [];
  const optionenFuer: { kennung: string; name: string }[] = [];
  const webauthn: WebAuthn = {
    registrierungsOptionen: async (k) => {
      optionenFuer.push(k);
      return { optionen: { challenge: 'reg' }, challenge: 'reg' };
    },
    pruefeRegistrierung: async (a, ch) => {
      const x = a as { cred: string; ok: boolean };
      return x.ok && ch === 'reg'
        ? { credentialId: x.cred, publicKey: new Uint8Array([1]), zaehler: 0, transports: [] }
        : null;
    },
    anmeldeOptionen: async () => ({ optionen: {}, challenge: 'anm' }),
    credentialIdAus: () => null,
    pruefeAnmeldung: async () => null,
  };
  const offen = new Map<
    string,
    { zweck: string; challenge: string; daten?: Record<string, string> }
  >();
  let n = 0;
  const challenges: Challenges = {
    lege: (zweck, challenge, _a, daten) => {
      const v = `v${++n}`;
      offen.set(v, { zweck, challenge, daten });
      return v;
    },
    nimm: (v, zweck) => {
      const c = offen.get(v);
      offen.delete(v);
      return c && c.zweck === zweck
        ? { challenge: c.challenge, adminId: null, daten: c.daten }
        : null;
    },
  };
  // Einladungen im Speicher
  const einl = new Map<
    string,
    { id: string; rolle: Rolle; genutzt: boolean; ortSlug?: string | null }
  >();
  const einladungen = {
    lege: async (
      token: string,
      rolle: Rolle,
      _von: string | null,
      tage: number,
      _bez?: string,
      ortSlug?: string | null,
    ) => {
      // unbekannter Ort der Kirmesgesellschaft → keine Einladung (wie die Datenbank)
      if (rolle === 'kirmesgesellschaft' && !['muehlberg', 'erfurt'].includes(ortSlug ?? ''))
        return null;
      const id = String(einl.size + 1);
      einl.set(`${token}-${id}`, { id, rolle, genutzt: false, ortSlug });
      return {
        id,
        rolle,
        ortSlug,
        erstelltAm: 'heute',
        laeuftAb: `in ${tage} Tagen`,
      } as EinladungInfo;
    },
    finde: async (token: string) => {
      const e = [...einl.entries()].find(([t]) => t.startsWith(`${token}-`))?.[1];
      return e && !e.genutzt
        ? { id: e.id, rolle: e.rolle, ortName: e.ortSlug === 'muehlberg' ? 'Mühlberg' : null }
        : null;
    },
    offene: async () =>
      [...einl.values()]
        .filter((e) => !e.genutzt)
        .map((e) => ({
          id: e.id,
          rolle: e.rolle,
          ortSlug: e.ortSlug,
          erstelltAm: 'heute',
          laeuftAb: 'bald',
        })),
    widerrufe: async (id: string) => {
      for (const [t, e] of einl) if (e.id === id) return einl.delete(t);
      return false;
    },
  };
  let anlageVerweigert = false;
  const anlage = {
    lege: async (k: NeuesKonto, s: { credentialId: string }, _name: string, b: Anlagebedingung) => {
      if (anlageVerweigert) return null;
      if (b.art === 'erster-admin' && konten.some((x) => x.rolle === 'admin')) return null;
      if (b.art === 'einladung') {
        const e = [...einl.values()].find((x) => x.id === b.einladungId && !x.genutzt);
        if (!e) return null;
        e.genutzt = true;
      }
      const id = String(konten.length + 1);
      konten.push({ ...k, id, cred: s.credentialId });
      return id;
    },
  };
  let kennungen = 0;
  const registrierung = new Registrierung(
    webauthn,
    challenges,
    anlage,
    {
      lege: async (id, t) => void sitzungen.push(`${id}:${t}`),
      pruefe: async () => null,
      beende: async () => {},
    },
    { neuesToken: () => 'TOKEN', neueKennung: () => `kennung-${++kennungen}` },
  );
  return {
    registrierung,
    einladungen,
    konten,
    sitzungen,
    optionenFuer,
    verweigere: () => (anlageVerweigert = true),
  };
}

const codes = (r: { ok: boolean; error?: unknown }) =>
  r.ok ? [] : (r.error as Validierungsfehler[]).map((f) => f.code);

describe('Registrierung', () => {
  it('legt Konto mit Passkey an – nur Name und zufällige Kennung, keine E-Mail', async () => {
    const { registrierung, konten, sitzungen, optionenFuer } = aufbau();
    const s = await registrierung.starte('  Ryan   S. ', 'redaktion', 'q');
    expect(s.ok).toBe(true);
    expect(optionenFuer).toEqual([{ kennung: 'kennung-1', name: 'Ryan S.' }]);
    const v = s.ok ? s.value.vorgang : '';
    const r = await registrierung.beende(v, { cred: 'c1', ok: true }, 'q', {
      art: 'erster-admin',
    });
    expect(r).toEqual({ ok: true, value: { token: 'TOKEN', stunden: 12, adminId: '1' } });
    expect(konten).toEqual([
      { id: '1', name: 'Ryan S.', rolle: 'redaktion', kennung: 'kennung-1', cred: 'c1' },
    ]);
    expect(sitzungen).toEqual(['1:TOKEN']);
  });

  it('prüft den Namen', async () => {
    const { registrierung } = aufbau();
    expect(codes(await registrierung.starte('   ', 'admin', 'q'))).toEqual(['PFLICHT']);
    expect(codes(await registrierung.starte('x'.repeat(61), 'admin', 'q'))).toEqual([
      'NAME_LAENGE',
    ]);
    // Richtungsumkehr und unsichtbare Zeichen würden Namen fälschen
    expect(codes(await registrierung.starte('Ryan\u202Enimda', 'admin', 'q'))).toEqual([
      'NAME_ZEICHEN',
    ]);
    expect(codes(await registrierung.starte('Ry\u200Ban', 'admin', 'q'))).toEqual(['NAME_ZEICHEN']);
    expect(codes(await registrierung.starte('Jo\u0007', 'admin', 'q'))).toEqual(['NAME_ZEICHEN']);
  });

  it('Challenge gilt nur einmal und nur für dieselbe Quelle; Signatur muss stimmen', async () => {
    const { registrierung, konten } = aufbau();
    const b = { art: 'erster-admin' } as const;
    const v1 = (await registrierung.starte('A', 'admin', 'q1')) as { value: { vorgang: string } };
    expect(await registrierung.beende(v1.value.vorgang, { cred: 'c', ok: true }, 'q2', b)).toEqual({
      ok: false,
      error: 'ABGELAUFEN',
    });
    // nach dem Fehlversuch ist die Challenge verbraucht
    expect(await registrierung.beende(v1.value.vorgang, { cred: 'c', ok: true }, 'q1', b)).toEqual({
      ok: false,
      error: 'ABGELAUFEN',
    });
    const v2 = (await registrierung.starte('A', 'admin', 'q1')) as { value: { vorgang: string } };
    expect(await registrierung.beende(v2.value.vorgang, { cred: 'c', ok: false }, 'q1', b)).toEqual(
      { ok: false, error: 'UNGUELTIG' },
    );
    expect(konten).toHaveLength(0);
  });

  it('meldet VERGEBEN, wenn die Bedingung beim Anlegen nicht mehr gilt', async () => {
    const { registrierung, verweigere, sitzungen } = aufbau();
    const v = (await registrierung.starte('A', 'admin', 'q')) as { value: { vorgang: string } };
    verweigere();
    expect(
      await registrierung.beende(v.value.vorgang, { cred: 'c', ok: true }, 'q', {
        art: 'erster-admin',
      }),
    ).toEqual({ ok: false, error: 'VERGEBEN' });
    expect(sitzungen).toHaveLength(0);
  });
});

describe('Registrierung mit unvollständigen Vorgangsdaten', () => {
  it('lehnt Vorgänge ohne gültige Rolle ab', async () => {
    const r = new Registrierung(
      {} as never,
      {
        lege: () => 'v',
        nimm: () => ({ challenge: 'reg', adminId: null, daten: { quelle: 'q', rolle: 'chef' } }),
      },
      {} as never,
      {} as never,
      { neuesToken: () => 'T', neueKennung: () => 'k' },
    );
    expect(await r.beende('v', {}, 'q', { art: 'erster-admin' })).toEqual({
      ok: false,
      error: 'ABGELAUFEN',
    });
  });
});

describe('Einladung annehmen (Beitritt)', () => {
  it('Rolle kommt aus der Einladung; Einladung gilt genau einmal', async () => {
    const { registrierung, einladungen, konten } = aufbau();
    const b = new Beitritt(einladungen, registrierung);
    await einladungen.lege('T1', 'redaktion', '1', 7);
    expect(await b.pruefe('T1')).toEqual({ ok: true, value: { rolle: 'redaktion' } });
    const s = (await b.starte('T1', 'Moni')) as { value: { vorgang: string } };
    const r = await b.beende('T1', s.value.vorgang, { cred: 'c', ok: true });
    expect(r.ok).toBe(true);
    expect(konten[0]).toMatchObject({ name: 'Moni', rolle: 'redaktion' });
    expect(await b.pruefe('T1')).toEqual({ ok: false, error: 'UNGUELTIG' });
    expect(await b.starte('T1', 'Noch wer')).toEqual({ ok: false, error: 'ABGELAUFEN' });
    expect(await b.beende('T1', 'v', {})).toEqual({ ok: false, error: 'ABGELAUFEN' });
  });

  it('Kirmesgesellschaft sieht beim Annehmen Rolle und Ort (Issue #242)', async () => {
    const { registrierung, einladungen } = aufbau();
    const b = new Beitritt(einladungen, registrierung);
    await einladungen.lege('T2', 'kirmesgesellschaft', '1', 7, 'KG', 'muehlberg');
    expect(await b.pruefe('T2')).toEqual({
      ok: true,
      value: { rolle: 'kirmesgesellschaft', ortName: 'Mühlberg' },
    });
  });
});

describe('Ersteinrichtung mit Passkey', () => {
  function einrichtung({ erlaubt = true } = {}) {
    const a = aufbau();
    const post: Nachricht[] = [];
    const gueltig = new Set<string>();
    let n = 0;
    const e = new Ersteinrichtung(
      { gibtEs: async () => a.konten.some((k) => k.rolle === 'admin') },
      {
        lege: () => {
          const l = `link-${++n}`;
          gueltig.add(l);
          return l;
        },
        gueltig: (l) => gueltig.has(l),
        verbrauche: (l) => void gueltig.delete(l),
      },
      { sende: async (m) => void post.push(m) },
      { erlaube: () => erlaubt },
      a.registrierung,
      'https://kirmes.example/',
    );
    return { ...a, e, post, gueltig };
  }

  it('schickt den Link ans Redaktionspostfach (ohne Reply-To) und legt den Admin an', async () => {
    const { e, post, konten, gueltig } = einrichtung();
    expect(await e.offen()).toBe(true);
    expect((await e.sendeLink()).ok).toBe(true);
    expect(post[0]!.antwortAn).toBeUndefined();
    expect(post[0]!.text).toContain('https://kirmes.example/admin/einrichten?link=link-1');
    expect((await e.pruefeLink('link-1')).ok).toBe(true);
    const s = (await e.starte('link-1', 'Ryan')) as { value: { vorgang: string } };
    const r = await e.schliesseAb('link-1', s.value.vorgang, { cred: 'c', ok: true });
    expect(r).toEqual({ ok: true, value: { token: 'TOKEN', stunden: 12 } });
    expect(konten[0]).toMatchObject({ name: 'Ryan', rolle: 'admin' });
    expect(gueltig.size).toBe(0);
    // danach gesperrt
    expect(await e.offen()).toBe(false);
    expect(await e.sendeLink()).toEqual({ ok: false, error: 'SCHON_EINGERICHTET' });
    expect(await e.pruefeLink('link-1')).toEqual({ ok: false, error: 'SCHON_EINGERICHTET' });
    expect(await e.starte('link-1', 'X')).toEqual({ ok: false, error: 'SCHON_EINGERICHTET' });
  });

  it('drosselt, lehnt fremde Links ab und meldet gleichzeitige Einrichtung', async () => {
    expect(await einrichtung({ erlaubt: false }).e.sendeLink()).toEqual({
      ok: false,
      error: 'ZU_VIELE',
    });
    const { e, verweigere } = einrichtung();
    await e.sendeLink();
    expect(await e.pruefeLink('erfunden')).toEqual({ ok: false, error: 'LINK_UNGUELTIG' });
    expect(await e.schliesseAb('erfunden', 'v', {})).toEqual({
      ok: false,
      error: 'LINK_UNGUELTIG',
    });
    const s = (await e.starte('link-1', 'Ryan')) as { value: { vorgang: string } };
    verweigere();
    expect(await e.schliesseAb('link-1', s.value.vorgang, { cred: 'c', ok: true })).toEqual({
      ok: false,
      error: 'SCHON_EINGERICHTET',
    });
    const s2 = (await e.starte('link-1', 'Ryan')) as { value: { vorgang: string } };
    expect(await e.schliesseAb('link-1', s2.value.vorgang, { cred: 'c', ok: false })).toEqual({
      ok: false,
      error: 'UNGUELTIG',
    });
  });
});

describe('Mitgliederverwaltung', () => {
  const admin: Sitzung = { adminId: '1', name: 'Ryan', rolle: 'admin' };
  const redakteurin: Sitzung = { adminId: '2', name: 'Moni', rolle: 'redaktion' };
  function verwaltung() {
    const { einladungen } = aufbau();
    const liste: Mitglied[] = [
      { id: '1', name: 'Ryan', rolle: 'admin', erstelltAm: 'a', letzterLogin: null, passkeys: 1 },
      {
        id: '2',
        name: 'Moni',
        rolle: 'redaktion',
        erstelltAm: 'b',
        letzterLogin: null,
        passkeys: 2,
      },
      {
        id: '3',
        name: 'Kevin',
        rolle: 'kirmesgesellschaft',
        ortSlug: 'muehlberg',
        erstelltAm: 'c',
        letzterLogin: null,
        passkeys: 1,
      },
      {
        id: '5',
        name: 'Lisa',
        rolle: 'kirmesgesellschaft',
        ortSlug: 'muehlberg',
        erstelltAm: 'e',
        letzterLogin: null,
        passkeys: 1,
      },
      {
        id: '4',
        name: 'Erfurter',
        rolle: 'kirmesgesellschaft',
        ortSlug: 'erfurt',
        erstelltAm: 'd',
        letzterLogin: null,
        passkeys: 1,
      },
    ];
    const v = new Mitgliederverwaltung(
      {
        liste: async () => liste,
        setzeRolle: async (id, rolle) => {
          const m = liste.find((x) => x.id === id);
          if (m) m.rolle = rolle;
          return !!m;
        },
        entferne: async (id) => {
          const i = liste.findIndex((x) => x.id === id);
          return i >= 0 && liste.splice(i, 1).length === 1;
        },
        anzahlAdmins: async () => liste.filter((x) => x.rolle === 'admin').length,
      },
      einladungen,
      { neuesToken: () => 'EINLADUNG' },
    );
    return { v, liste };
  }

  it('Redaktion darf nichts verwalten', async () => {
    const { v } = verwaltung();
    const nein = { ok: false, error: 'NUR_ADMIN' };
    expect(await v.liste(redakteurin)).toEqual(nein);
    expect(await v.setzeRolle(redakteurin, '2', 'admin')).toEqual(nein);
    expect(await v.entferne(redakteurin, '1')).toEqual(nein);
    expect(await v.lade(redakteurin, 'redaktion')).toEqual(nein);
    expect(await v.offeneEinladungen(redakteurin)).toEqual(nein);
    expect(await v.widerrufe(redakteurin, '1')).toEqual(nein);
  });

  it('Kirmesgesellschaft nur mit bekanntem Ort einladen, nie per Rollenwechsel (Issue #180)', async () => {
    const { v } = verwaltung();
    expect(await v.lade(admin, 'kirmesgesellschaft', 'KG')).toEqual({
      ok: false,
      error: 'ORT_FEHLT',
    });
    expect(await v.lade(admin, 'kirmesgesellschaft', 'KG', 'gibtsnicht')).toEqual({
      ok: false,
      error: 'ORT_FEHLT',
    });
    expect((await v.lade(admin, 'kirmesgesellschaft', 'KG', ' muehlberg ')).ok).toBe(true);
    expect(await v.setzeRolle(admin, '2', 'kirmesgesellschaft')).toEqual({
      ok: false,
      error: 'ROLLE',
    });
  });

  it('Kirmesgesellschaft lädt nur eigene Leute ein und sieht nur ihren Ort (Issue #231)', async () => {
    const { v } = verwaltung();
    const kevin: Sitzung = {
      adminId: '3',
      name: 'Kevin',
      rolle: 'kirmesgesellschaft',
      ortSlug: 'muehlberg',
    };
    // Ort wird erzwungen – ein mitgesendeter fremder Ort zählt nicht
    const neu = await v.lade(kevin, 'kirmesgesellschaft', 'Lisa', 'erfurt');
    expect(neu.ok && neu.value.ortSlug).toBe('muehlberg');
    expect(await v.lade(kevin, 'redaktion', 'X')).toEqual({ ok: false, error: 'ROLLE' });
    expect(await v.lade(kevin, 'admin', 'X')).toEqual({ ok: false, error: 'ROLLE' });
    // nur Leute des eigenen Ortes
    const leute = await v.liste(kevin);
    expect(leute.ok && leute.value.map((m) => m.name)).toEqual(['Kevin', 'Lisa']);
    // fremde Einladung (vom Admin für Erfurt) weder sichtbar noch widerrufbar
    const fremd = await v.lade(admin, 'kirmesgesellschaft', 'E', 'erfurt');
    const offen = await v.offeneEinladungen(kevin);
    expect(offen.ok && offen.value.map((e) => e.ortSlug)).toEqual(['muehlberg']);
    expect(await v.widerrufe(kevin, fremd.ok ? fremd.value.id : '')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    expect(await v.widerrufe(kevin, neu.ok ? neu.value.id : '')).toEqual({ ok: true, value: true });
    expect(await v.widerrufe(kevin, neu.ok ? neu.value.id : '')).toEqual({
      ok: false,
      error: 'NICHT_GEFUNDEN',
    });
    // Rollen bleiben Admin-Sache
    expect(await v.setzeRolle(kevin, '3', 'admin')).toEqual({ ok: false, error: 'NUR_ADMIN' });
    // Entfernen (Issue #233): nur eigene Leute, nicht sich selbst, keine Admins, keine fremden Orte
    const nichtGefunden = { ok: false, error: 'NICHT_GEFUNDEN' };
    expect(await v.entferne(kevin, '4')).toEqual(nichtGefunden);
    expect(await v.entferne(kevin, '1')).toEqual(nichtGefunden);
    expect(await v.entferne(kevin, '3')).toEqual(nichtGefunden);
    expect(await v.entferne(kevin, '99')).toEqual(nichtGefunden);
    expect(await v.entferne(kevin, '5')).toEqual({ ok: true, value: true });
    expect(await v.entferne(kevin, '5')).toEqual(nichtGefunden);
    // ohne Ort im Konto: wie Redaktion – nichts
    const ohneOrt: Sitzung = { adminId: '9', name: 'X', rolle: 'kirmesgesellschaft' };
    expect(await v.liste(ohneOrt)).toEqual({ ok: false, error: 'NUR_ADMIN' });
  });

  it('Admin lädt ein, ändert Rollen und entfernt – der letzte Admin bleibt', async () => {
    const { v, liste } = verwaltung();
    expect((await v.liste(admin)).ok).toBe(true);
    const e = await v.lade(admin, 'redaktion');
    expect(e).toEqual({
      ok: true,
      value: {
        id: '1',
        rolle: 'redaktion',
        ortSlug: null,
        erstelltAm: 'heute',
        laeuftAb: 'in 7 Tagen',
        token: 'EINLADUNG',
      },
    });
    expect(await v.offeneEinladungen(admin)).toMatchObject({ ok: true, value: [{ id: '1' }] });
    expect(await v.widerrufe(admin, '1')).toEqual({ ok: true, value: true });
    expect(await v.widerrufe(admin, '1')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });

    expect(await v.setzeRolle(admin, '1', 'redaktion')).toEqual({
      ok: false,
      error: 'LETZTER_ADMIN',
    });
    expect(await v.entferne(admin, '1')).toEqual({ ok: false, error: 'LETZTER_ADMIN' });
    expect(await v.setzeRolle(admin, '2', 'admin')).toEqual({ ok: true, value: true });
    // jetzt gibt es zwei Admins – einer darf gehen
    expect(await v.entferne(admin, '1')).toEqual({ ok: true, value: true });
    expect(liste.map((m) => m.id)).toEqual(['2', '3', '5', '4']);
    expect(await v.setzeRolle(admin, '9', 'admin')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect(await v.entferne(admin, '9')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
  });
});
