import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { Korrekturen } from '@kirmes/core';
import { korrekturRouten } from '../src/interfaces/http/korrektur-routen.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps.length = 0;
});
const ID = '837e5b5e-4ce6-41bf-9fe2-d4ee50554823';
function setup() {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  apps.push(app);
  const k = {
    melde: vi.fn(async () => ({ ok: true, value: { angenommen: true } })),
    liste: vi.fn(async () => ({ ok: true, value: [] })),
    anzahl: vi.fn(async () => ({ ok: true, value: 1 })),
    erledige: vi.fn(async () => ({ ok: true, value: true })),
  };
  void app.register(async (a) => korrekturRouten(a, k as unknown as Korrekturen, () => 'ip'));
  return { app, k };
}
const headers = { authorization: 'Sitzung token' };

describe('Korrektur-API (#107)', () => {
  it('nimmt öffentlich an, ohne Daten zurückzugeben', async () => {
    const { app, k } = setup();
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/termine/${ID}/korrekturen`,
      payload: { text: 'Beginn 19 Uhr', dauerMs: 4000 },
    });
    expect(r.statusCode).toBe(202);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(k.melde).toHaveBeenCalledWith(ID, { text: 'Beginn 19 Uhr', dauerMs: 4000 }, 'ip');
  });
  it.each([{}, { text: 'x', extra: 1 }, { text: 'x'.repeat(2001) }])(
    'lehnt ungültige Körper ab: %o',
    async (payload) => {
      const { app } = setup();
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/termine/${ID}/korrekturen`,
        payload,
      });
      expect(r.statusCode).toBe(400);
    },
  );
  it('bildet Fehler auf Statuscodes ab', async () => {
    const { app, k } = setup();
    for (const [error, status] of [
      ['ZU_VIELE', 429],
      ['NICHT_GEFUNDEN', 404],
      [[{ feld: 'text', code: 'X', meldung: 'm' }], 400],
    ] as const) {
      k.melde.mockResolvedValueOnce({ ok: false, error } as never);
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/termine/${ID}/korrekturen`,
        payload: { text: 'x' },
      });
      expect(r.statusCode).toBe(status);
    }
  });
  it('Redaktion: Liste, Anzahl, erledigen; ohne Sitzung 403', async () => {
    const { app, k } = setup();
    expect((await app.inject({ url: '/api/v1/admin/korrekturen', headers })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/admin/korrekturen/anzahl', headers })).json()).toEqual(
      { anzahl: 1 },
    );
    const e = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/korrekturen/${ID}/erledigt`,
      headers,
    });
    expect(e.statusCode).toBe(204);
    k.erledige.mockResolvedValueOnce({ ok: false, error: 'NICHT_GEFUNDEN' } as never);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/korrekturen/${ID}/erledigt`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    k.liste.mockResolvedValueOnce({ ok: false, error: 'VERBOTEN' } as never);
    expect((await app.inject({ url: '/api/v1/admin/korrekturen', headers })).statusCode).toBe(403);
    k.anzahl.mockResolvedValueOnce({ ok: false, error: 'VERBOTEN' } as never);
    expect((await app.inject({ url: '/api/v1/admin/korrekturen' })).statusCode).toBe(403);
  });
});
