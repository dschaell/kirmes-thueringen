import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  PLAKAT_MAX_BYTES,
  Plakate,
  type Plakatbild,
  type PlakatAblage,
  type Sitzung,
} from '../src/index.js';

const admin: Sitzung = { adminId: '1', name: 'A', rolle: 'admin' };
const kg: Sitzung = { adminId: '3', name: 'KG', rolle: 'kirmesgesellschaft', ortSlug: 'ulla' };
const bild: Plakatbild = {
  gross: new Uint8Array([1]),
  klein: new Uint8Array([2]),
  breite: 800,
  hoehe: 1131,
};

function aufbau(wandelbar = true) {
  const gespeichert = new Map<string, Plakatbild>();
  const orte: Record<string, string> = { t1: 'ulla', t2: 'mellingen' };
  const ablage: PlakatAblage = {
    ortVon: async (id) => orte[id] ?? null,
    speichere: async (id, b) => void gespeichert.set(id, b),
    loesche: async (id) => gespeichert.delete(id),
    lade: async (id, g) => gespeichert.get(id)?.[g] ?? null,
  };
  const p = new Plakate(ablage, { wandle: async () => (wandelbar ? bild : null) });
  return { p, gespeichert };
}

describe('Plakate (Issue #297)', () => {
  it('speichert, zeigt in beiden Größen und entfernt', async () => {
    const { p } = aufbau();
    expect(await p.lade(admin, 't1', new Uint8Array(10))).toEqual(ok({ breite: 800, hoehe: 1131 }));
    expect(await p.zeige('t1', 'gross')).toEqual(new Uint8Array([1]));
    expect(await p.zeige('t1', 'klein')).toEqual(new Uint8Array([2]));
    expect(await p.entferne(admin, 't1')).toEqual(ok(true));
    expect(await p.entferne(admin, 't1')).toEqual(err('NICHT_GEFUNDEN'));
    expect(await p.zeige('t1', 'gross')).toBeNull();
  });
  it('Kirmesgesellschaft nur am eigenen Ort; fremde Termine gibt es für sie nicht', async () => {
    const { p, gespeichert } = aufbau();
    expect((await p.lade(kg, 't1', new Uint8Array(1))).ok).toBe(true);
    expect(await p.lade(kg, 't2', new Uint8Array(1))).toEqual(err('NICHT_GEFUNDEN'));
    expect(await p.entferne(kg, 't2')).toEqual(err('NICHT_GEFUNDEN'));
    expect(gespeichert.has('t2')).toBe(false);
    const ohneRolle = { adminId: '9', name: 'X' } as Sitzung;
    expect(await p.lade(ohneRolle, 't1', new Uint8Array(1))).toEqual(err('NUR_ADMIN'));
  });
  it('unbekannter Termin, zu groß, kein Bild', async () => {
    const { p } = aufbau(false);
    expect(await p.lade(admin, 'x', new Uint8Array(1))).toEqual(err('NICHT_GEFUNDEN'));
    expect(await p.lade(admin, 't1', new Uint8Array(PLAKAT_MAX_BYTES + 1))).toEqual(
      err('ZU_GROSS'),
    );
    expect(await p.lade(admin, 't1', new Uint8Array(1))).toEqual(err('KEIN_BILD'));
  });
});
