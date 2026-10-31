import { Benachrichtigungen } from '@kirmes/core';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ladeKonfiguration } from '../src/config.js';
import { WebPushVersand, type SendeFunktion } from '../src/infrastructure/push-versand.js';
import { pushRouten } from '../src/interfaces/http/push-routen.js';

const vapid = { oeffentlich: 'BPub', privat: 'priv', kontakt: 'mailto:redaktion@kirmes.example' };
const ziel = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'BAbc', auth: 'xyz' };
const n = { titel: 'Neu', text: 'Text', url: '/termin/1', tag: 'termin-1 äöü' };

describe('Web-Push-Versand (Issue #348)', () => {
  it('signiert mit VAPID, schickt JSON, Thema ohne Sonderzeichen', async () => {
    const aufrufe: Parameters<SendeFunktion>[] = [];
    const v = new WebPushVersand(vapid, async (...a) => void aufrufe.push(a));
    expect(await v.sende(ziel, n)).toBe('zugestellt');
    expect(aufrufe[0]?.[0]).toEqual({
      endpoint: ziel.endpoint,
      keys: { p256dh: 'BAbc', auth: 'xyz' },
    });
    expect(JSON.parse(aufrufe[0]?.[1] ?? '')).toEqual(n);
    expect(aufrufe[0]?.[2]).toMatchObject({
      TTL: 86400,
      topic: 'termin-1',
      vapidDetails: { subject: vapid.kontakt, publicKey: 'BPub', privateKey: 'priv' },
    });
    await v.sende(ziel, { ...n, tag: 'ä' });
    expect(aufrufe[1]?.[2].topic).toBeUndefined();
  });
  it('404/410 = abgemeldet, sonst Fehler', async () => {
    const mit = (e: unknown) => new WebPushVersand(vapid, async () => Promise.reject(e));
    expect(await mit({ statusCode: 410 }).sende(ziel, n)).toBe('abgemeldet');
    expect(await mit({ statusCode: 404 }).sende(ziel, n)).toBe('abgemeldet');
    expect(await mit({ statusCode: 500 }).sende(ziel, n)).toBe('fehler');
    expect(await mit(null).sende(ziel, n)).toBe('fehler');
  });
});

describe('Push-Konfiguration (Issue #348)', () => {
  const basis = { DATABASE_URL: 'x' };
  it('ohne Schlüssel aus, vollständig an, halb oder falscher Kontakt bricht ab', () => {
    expect(ladeKonfiguration(basis).vapid).toBeNull();
    const voll = {
      ...basis,
      VAPID_PUBLIC_KEY: 'p',
      VAPID_PRIVATE_KEY: 'q',
      VAPID_KONTAKT: 'mailto:a@b.de',
    };
    expect(ladeKonfiguration(voll).vapid).toEqual({
      oeffentlich: 'p',
      privat: 'q',
      kontakt: 'mailto:a@b.de',
    });
    expect(() => ladeKonfiguration({ ...basis, VAPID_PUBLIC_KEY: 'p' })).toThrow(
      'Push unvollständig, es fehlt: VAPID_PRIVATE_KEY, VAPID_KONTAKT',
    );
    expect(() => ladeKonfiguration({ ...voll, VAPID_KONTAKT: 'a@b.de' })).toThrow('mailto:');
  });
});

describe('Push-Routen (Issue #348)', () => {
  async function app() {
    const gespeichert: unknown[] = [];
    const geloescht: string[] = [];
    const b = new Benachrichtigungen(
      {
        speichere: async (a) => void gespeichert.push(a),
        loesche: async (e) => (geloescht.push(e), true),
        empfaenger: async () => [],
        erinnerungen: async () => [],
        raeumeAuf: async () => {},
      },
      { sende: async () => 'zugestellt' },
    );
    const f = Fastify();
    await pushRouten(f, { benachrichtigungen: b, oeffentlich: 'BPub' });
    return { f, gespeichert, geloescht };
  }
  const body = {
    endpoint: ziel.endpoint,
    keys: { p256dh: 'BAbc', auth: 'xyz' },
    orte: ['muehlberg'],
    termine: [],
  };
  it('Schlüssel, Abo anlegen (Erinnerung standardmäßig an), Fehler, Abmelden', async () => {
    const { f, gespeichert, geloescht } = await app();
    const s = await f.inject({ method: 'GET', url: '/api/v1/push/schluessel' });
    expect([s.statusCode, s.json(), s.headers['cache-control']]).toEqual([
      200,
      { oeffentlich: 'BPub' },
      'no-store',
    ]);
    expect(
      (await f.inject({ method: 'PUT', url: '/api/v1/push/abo', payload: body })).statusCode,
    ).toBe(204);
    expect(gespeichert[0]).toMatchObject({
      endpoint: ziel.endpoint,
      orte: ['muehlberg'],
      erinnerung: true,
    });
    await f.inject({
      method: 'PUT',
      url: '/api/v1/push/abo',
      payload: { ...body, erinnerung: false },
    });
    expect(gespeichert[1]).toMatchObject({ erinnerung: false });
    const fremd = await f.inject({
      method: 'PUT',
      url: '/api/v1/push/abo',
      payload: { ...body, endpoint: 'https://example.org/x' },
    });
    expect([fremd.statusCode, fremd.json().code]).toEqual([400, 'ENDPUNKT']);
    expect(
      (
        await f.inject({
          method: 'PUT',
          url: '/api/v1/push/abo',
          payload: { ...body, termine: 'kein-array' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.inject({
          method: 'DELETE',
          url: '/api/v1/push/abo',
          payload: { endpoint: ziel.endpoint },
        })
      ).statusCode,
    ).toBe(204);
    expect(geloescht).toEqual([ziel.endpoint]);
  });
});
