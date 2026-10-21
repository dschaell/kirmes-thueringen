import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { type Vorschlaege } from '@kirmes/core';
import { vorschlagRouten } from '../src/interfaces/http/vorschlag-routen.js';
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps.length = 0;
});
function setup() {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  apps.push(app);
  const v = {
    anzahl: vi.fn(async () => ({ ok: true, value: 2 })),
    liste: vi.fn(async () => ({ ok: true, value: [] })),
    finde: vi.fn(async () => ({ ok: true, value: { id: 'test' } })),
    melde: vi.fn(async () => ({ ok: true, value: { angenommen: true } })),
    uebernehme: vi.fn(async () => ({ ok: true, value: true })),
    lehneAb: vi.fn(async () => ({ ok: true, value: true })),
  };
  const herkunft = vi.fn(() => 'ip');
  void app.register(async (a) => vorschlagRouten(a, v as unknown as Vorschlaege, herkunft));
  return { app, v, herkunft };
}
const body = {
  ortSlug: 'alkersleben',
  zeilen: [{ datum: '2027-09-17', titel: 'Kirmestanz' }],
  dauerMs: 3000,
};
const headers = { authorization: 'Sitzung token' };
describe('Vorschlags-API', () => {
  it('öffentlich annehmen mit IP nur als transienter Drosselungsschlüssel, nie als Antwort', async () => {
    const { app, v, herkunft } = setup();
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/vorschlaege',
      payload: body,
      headers: { 'x-kirmes-client-ip': '1.2.3.4' },
    });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ angenommen: true });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(herkunft).toHaveBeenCalled();
    expect(v.melde).toHaveBeenCalledWith(body, 'ip');
  });
  it.each([
    { extra: 'x' },
    { zeilen: Array(21).fill(body.zeilen[0]) },
    { zeilen: [{ ...body.zeilen[0], extra: true }] },
    { zeilen: [{ ...body.zeilen[0], speisen: [{ name: 'Klöße', preis: '9', extra: true }] }] },
  ])('Schemas weisen unerlaubte Mengen und Felder ab', async (extra) => {
    const { app, v } = setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/vorschlaege',
          payload: { ...body, ...extra },
        })
      ).statusCode,
    ).toBe(400);
    expect(v.melde).not.toHaveBeenCalled();
  });
  it.each(['ZU_VIELE', 'ORT_VOLL'])('429 bei Missbrauchsgrenzen %s', async (error) => {
    const { app, v } = setup();
    v.melde.mockResolvedValue({ ok: false, error } as never);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/vorschlaege', payload: body })).statusCode,
    ).toBe(429);
  });
  it('Validierungsfehler mit 400', async () => {
    const { app, v } = setup();
    v.melde.mockResolvedValue({
      ok: false,
      error: [{ feld: 'titel', meldung: 'Titel fehlt' }],
    } as never);
    const r = await app.inject({ method: 'POST', url: '/api/v1/vorschlaege', payload: body });
    expect(r.statusCode).toBe(400);
    expect(r.json().fehler).toHaveLength(1);
  });
  it('Lesen, Übernehmen und Ablehnen nur nach Use-Case-Sitzungsprüfung', async () => {
    const { app, v } = setup();
    v.anzahl.mockResolvedValue({ ok: false, error: 'VERBOTEN' } as never);
    for (const [method, url, payload] of [
      ['GET', '/api/v1/admin/termine-vorschlaege', undefined],
      ['GET', '/api/v1/admin/termine-vorschlaege/anzahl', undefined],
      ['GET', '/api/v1/admin/termine-vorschlaege/id', undefined],
      ['POST', '/api/v1/admin/termine-vorschlaege/id/uebernehmen', body],
      ['POST', '/api/v1/admin/termine-vorschlaege/id/ablehnen', {}],
    ] as const)
      expect((await app.inject({ method, url, payload })).statusCode).toBe(403);
    expect(v.liste).not.toHaveBeenCalled();
    expect(v.uebernehme).not.toHaveBeenCalled();
    expect(v.lehneAb).not.toHaveBeenCalled();
  });
  it('Redaktion kann Anzahl, Liste und Einzelvorschlag lesen', async () => {
    const { app, v } = setup();
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege', headers })).json(),
    ).toEqual([]);
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege/anzahl', headers })).json(),
    ).toEqual({ anzahl: 2 });
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege/id', headers })).json(),
    ).toEqual({ id: 'test' });
    expect(v.finde).toHaveBeenCalledWith('token', 'id');
  });
  it('Übernahme und Ablehnen, mit optionalen Angaben', async () => {
    const { app, v } = setup();
    for (const payload of [
      { ortSlug: body.ortSlug, zeilen: body.zeilen },
      { ortSlug: body.ortSlug, zeilen: body.zeilen, bestaetigt: true },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/admin/termine-vorschlaege/id/uebernehmen',
            payload,
            headers,
          })
        ).statusCode,
      ).toBe(204);
    // „bestätigt“ bestimmt der Use Case aus der Rolle (Issue #240) – kein eigener Parameter mehr
    expect(v.uebernehme).toHaveBeenLastCalledWith('token', 'id', expect.objectContaining({}));
    expect(vi.mocked(v.uebernehme).mock.lastCall).toHaveLength(3);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/termine-vorschlaege/id/ablehnen',
          payload: { grund: 'Doppelt' },
          headers,
        })
      ).statusCode,
    ).toBe(204);
  });
  it('404 bei unbekanntem Vorschlag in allen Bearbeitungsrouten', async () => {
    const { app, v } = setup();
    for (const fn of [v.finde, v.uebernehme, v.lehneAb])
      fn.mockResolvedValue({ ok: false, error: 'NICHT_GEFUNDEN' } as never);
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege/id', headers })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/termine-vorschlaege/id/uebernehmen',
          payload: { ortSlug: body.ortSlug, zeilen: body.zeilen },
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/termine-vorschlaege/id/ablehnen',
          payload: {},
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('409 bei existierendem Termin überschreibt keine Daten', async () => {
    const { app, v } = setup();
    v.uebernehme.mockResolvedValue({ ok: false, error: 'KONFLIKT' } as never);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/termine-vorschlaege/id/uebernehmen',
          payload: { ortSlug: body.ortSlug, zeilen: body.zeilen },
          headers,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('eine zwischen Prüfung und Aktion abgelaufene Sitzung wird erneut verweigert', async () => {
    const { app, v } = setup();
    v.liste.mockResolvedValue({ ok: false, error: 'VERBOTEN' } as never);
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege', headers })).statusCode,
    ).toBe(403);
    v.anzahl
      .mockResolvedValueOnce({ ok: true, value: 2 })
      .mockResolvedValueOnce({ ok: false, error: 'VERBOTEN' } as never);
    expect(
      (await app.inject({ url: '/api/v1/admin/termine-vorschlaege/anzahl', headers })).statusCode,
    ).toBe(403);
  });
});
