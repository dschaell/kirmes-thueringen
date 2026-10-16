import { describe, expect, it } from 'vitest';
import {
  MAX_PASSKEYS,
  Passkeys,
  type Challenges,
  type Passkey,
  type PasskeyRepository,
  type WebAuthn,
} from '../src/index.js';

function aufbau() {
  const passkeys: Passkey[] = [];
  const sitzungen: string[] = [];
  const logins: string[] = [];
  let fehler = 0;
  const repo: PasskeyRepository = {
    liste: async (adminId) => passkeys.filter((p) => p.adminId === adminId),
    findeNachCredential: async (c) => passkeys.find((p) => p.credentialId === c) ?? null,
    lege: async (p) => {
      const neu = {
        ...p,
        id: String(passkeys.length + 1),
        erstelltAm: 'heute',
        zuletztGenutzt: null,
      };
      passkeys.push(neu);
      return { id: neu.id, name: neu.name, erstelltAm: neu.erstelltAm, zuletztGenutzt: null };
    },
    merkeNutzung: async (id, zaehler) => {
      const p = passkeys.find((x) => x.id === id)!;
      p.zaehler = zaehler;
      p.zuletztGenutzt = 'jetzt';
    },
    konto: async (id) => (id === '1' || id === '2' ? { kennung: `k${id}`, name: 'Ryan' } : null),
    loesche: async (adminId, id) => {
      const i = passkeys.findIndex((p) => p.adminId === adminId && p.id === id);
      return i >= 0 && passkeys.splice(i, 1).length === 1;
    },
  };
  // Fake-WebAuthn: Antworten sind { cred, ok, zaehler }
  const webauthn: WebAuthn = {
    registrierungsOptionen: async () => ({ optionen: { challenge: 'reg' }, challenge: 'reg' }),
    pruefeRegistrierung: async (a, ch) => {
      const x = a as { cred: string; ok: boolean };
      return x.ok && ch === 'reg'
        ? {
            credentialId: x.cred,
            publicKey: new Uint8Array([1]),
            zaehler: 0,
            transports: ['internal'],
          }
        : null;
    },
    anmeldeOptionen: async () => ({ optionen: { challenge: 'anm' }, challenge: 'anm' }),
    credentialIdAus: (a) => (a as { cred?: string }).cred ?? null,
    pruefeAnmeldung: async (a, ch) => {
      const x = a as { ok: boolean; zaehler: number };
      return x.ok && ch === 'anm' ? { zaehler: x.zaehler } : null;
    },
  };
  const offen = new Map<string, { zweck: string; challenge: string; adminId: string | null }>();
  let n = 0;
  const challenges: Challenges = {
    lege: (zweck, challenge, adminId) => {
      const v = `v${++n}`;
      offen.set(v, { zweck, challenge, adminId });
      return v;
    },
    nimm: (v, zweck) => {
      const c = offen.get(v);
      offen.delete(v);
      return c && c.zweck === zweck ? c : null;
    },
  };
  const pk = new Passkeys(
    repo,
    webauthn,
    challenges,
    {
      lege: async (adminId, token) => void sitzungen.push(`${adminId}:${token}`),
      pruefe: async () => null,
      beende: async () => {},
    },
    { merkeLogin: async (id) => void logins.push(id) },
    { neuesToken: () => 'TOKEN' },
    { gesperrt: () => fehler >= 3, fehlschlag: () => void fehler++, erfolg: () => (fehler = 0) },
  );
  return { pk, passkeys, sitzungen, logins };
}

/** Optionen für einen weiteren Passkey – im Test gibt es Konto 1 immer */
const starte = async (pk: Passkeys, id = '1') => (await pk.starteEinrichtung(id))!;

describe('Passkeys einrichten', () => {
  it('legt einen Passkey an – Challenge nur einmal verwendbar', async () => {
    const { pk } = aufbau();
    const { vorgang, optionen } = await starte(pk);
    expect(optionen).toEqual({ challenge: 'reg' });
    const r = await pk.beendeEinrichtung(
      '1',
      vorgang,
      { cred: 'c1', ok: true },
      '  iPhone   von Ryan ',
    );
    expect(r.ok && r.value).toMatchObject({ name: 'iPhone von Ryan' });
    const nochmal = await pk.beendeEinrichtung('1', vorgang, { cred: 'c2', ok: true }, 'x');
    expect(!nochmal.ok && nochmal.error[0]?.code).toBe('ABGELAUFEN');
    expect(await pk.liste('1')).toHaveLength(1);
  });

  it('lehnt fremde Vorgänge, ungültige Antworten und zu lange Namen ab', async () => {
    const { pk } = aufbau();
    const { vorgang } = await starte(pk);
    expect((await pk.beendeEinrichtung('2', vorgang, { cred: 'c', ok: true }, '')).ok).toBe(false);
    const v2 = (await starte(pk)).vorgang;
    const falsch = await pk.beendeEinrichtung('1', v2, { cred: 'c', ok: false }, '');
    expect(!falsch.ok && falsch.error[0]?.code).toBe('UNGUELTIG');
    const v3 = (await starte(pk)).vorgang;
    const lang = await pk.beendeEinrichtung('1', v3, { cred: 'c', ok: true }, 'x'.repeat(61));
    expect(!lang.ok && lang.error[0]?.code).toBe('NAME_LAENGE');
  });

  it('begrenzt die Anzahl und löscht nur eigene Passkeys', async () => {
    const { pk } = aufbau();
    for (let i = 0; i < MAX_PASSKEYS; i++) {
      const { vorgang } = await starte(pk);
      await pk.beendeEinrichtung('1', vorgang, { cred: `c${i}`, ok: true }, '');
    }
    const { vorgang } = await starte(pk);
    const zuViel = await pk.beendeEinrichtung('1', vorgang, { cred: 'neu', ok: true }, '');
    expect(!zuViel.ok && zuViel.error[0]?.code).toBe('ZU_VIELE');
    expect(await pk.loesche('2', '1')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect(await pk.loesche('1', '1')).toEqual({ ok: true, value: true });
  });

  it('der letzte Passkey bleibt, unbekannte Konten bekommen keine Optionen', async () => {
    const { pk, passkeys } = aufbau();
    const { vorgang } = await starte(pk);
    await pk.beendeEinrichtung('1', vorgang, { cred: 'c1', ok: true }, 'Mac');
    expect(await pk.loesche('1', passkeys[0]!.id)).toEqual({ ok: false, error: 'LETZTER' });
    expect(await pk.liste('1')).toHaveLength(1);
    expect(await pk.starteEinrichtung('99')).toBeNull();
  });
});

describe('Mit Passkey anmelden', () => {
  async function mitPasskey() {
    const a = aufbau();
    const { vorgang } = await starte(a.pk);
    await a.pk.beendeEinrichtung('1', vorgang, { cred: 'c1', ok: true }, 'Mac');
    return a;
  }

  it('meldet an, legt eine Sitzung an und merkt die Nutzung', async () => {
    const { pk, sitzungen, logins, passkeys } = await mitPasskey();
    const { vorgang } = await pk.starteAnmeldung();
    const r = await pk.beendeAnmeldung(vorgang, { cred: 'c1', ok: true, zaehler: 0 });
    expect(r.ok && r.value).toEqual({ token: 'TOKEN', stunden: 12 });
    expect(sitzungen).toEqual(['1:TOKEN']);
    expect(logins).toEqual(['1']);
    expect(passkeys[0]?.zuletztGenutzt).toBe('jetzt');
  });

  it('gleiche Antwort für unbekannten Passkey, falsche Signatur und verbrauchte Challenge', async () => {
    const { pk } = await mitPasskey();
    const v1 = (await pk.starteAnmeldung()).vorgang;
    expect((await pk.beendeAnmeldung(v1, { cred: 'fremd', ok: true, zaehler: 0 })).ok).toBe(false);
    const v2 = (await pk.starteAnmeldung()).vorgang;
    const falsch = await pk.beendeAnmeldung(v2, { cred: 'c1', ok: false, zaehler: 0 });
    expect(!falsch.ok && falsch.error).toBe('UNGUELTIG');
    expect((await pk.beendeAnmeldung(v2, { cred: 'c1', ok: true, zaehler: 0 })).ok).toBe(false);
    const v3 = (await pk.starteAnmeldung()).vorgang;
    expect((await pk.beendeAnmeldung(v3, { ok: true, zaehler: 0 })).ok).toBe(false);
    expect((await pk.beendeAnmeldung('erfunden', { cred: 'c1', ok: true, zaehler: 0 })).ok).toBe(
      false,
    );
  });

  it('erkennt geklonte Authenticatoren am Zähler und sperrt nach Fehlversuchen', async () => {
    const { pk } = await mitPasskey();
    const v1 = (await pk.starteAnmeldung()).vorgang;
    expect((await pk.beendeAnmeldung(v1, { cred: 'c1', ok: true, zaehler: 5 })).ok).toBe(true);
    const v2 = (await pk.starteAnmeldung()).vorgang;
    expect((await pk.beendeAnmeldung(v2, { cred: 'c1', ok: true, zaehler: 5 })).ok).toBe(false);
    for (let i = 0; i < 2; i++) {
      const v = (await pk.starteAnmeldung()).vorgang;
      await pk.beendeAnmeldung(v, { cred: 'x', ok: true, zaehler: 9 });
    }
    const v4 = (await pk.starteAnmeldung()).vorgang;
    const gesperrt = await pk.beendeAnmeldung(v4, { cred: 'c1', ok: true, zaehler: 9 });
    expect(!gesperrt.ok && gesperrt.error).toBe('GESPERRT');
  });
});
