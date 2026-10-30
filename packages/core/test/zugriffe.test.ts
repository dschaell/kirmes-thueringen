import { describe, expect, it } from 'vitest';
import { err, Zugriffe, type Aufruf, type Sitzung } from '../src/index.js';

const admin: Sitzung = { adminId: '1', name: 'A', rolle: 'admin' };
const red: Sitzung = { adminId: '2', name: 'R', rolle: 'redaktion' };

describe('Zugriffszahlen (Issue #311)', () => {
  it('erfasst nur gültige Einträge; leer → keine Speicherung', async () => {
    const erfasst: Aufruf[][] = [];
    const z = new Zugriffe({
      erfasse: async (a) => void erfasst.push(a),
      statistik: async (t) => ({ tage: [{ tag: String(t), anzahl: 1 }], seiten: [] }),
      raeumeAuf: async () => {},
    });
    expect(
      await z.erfasse([
        { pfad: '/orte/mühlberg', anzahl: 2 },
        { pfad: 'kein-slash', anzahl: 1 },
        { pfad: '/x', anzahl: 0 },
        { pfad: '/<script>', anzahl: 1 },
        { pfad: '/y', anzahl: 1.5 },
      ]),
    ).toBe(1);
    expect(await z.erfasse([{ pfad: 'x', anzahl: 1 }])).toBe(0);
    expect(erfasst).toEqual([[{ pfad: '/orte/mühlberg', anzahl: 2 }]]);
    expect(await z.statistik(red)).toEqual(err('NUR_ADMIN'));
    const s = await z.statistik(admin, 9999);
    expect(s.ok && s.value.tage[0]?.tag).toBe('400');
    const d = await z.statistik(admin, Number.NaN);
    expect(d.ok && d.value.tage[0]?.tag).toBe('30');
  });
});
