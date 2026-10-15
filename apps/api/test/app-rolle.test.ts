import { describe, expect, it } from 'vitest';
import { richteAppLoginEin } from '../src/infrastructure/postgres/app-rolle.js';

describe('richteAppLoginEin (ohne Datenbank)', () => {
  it('bricht ab, wenn der Server keine Anweisung liefert', async () => {
    const db = { query: async () => ({ rows: [] }) };
    await expect(richteAppLoginEin(db as never, 'x'.repeat(20))).rejects.toThrow(
      'Rollen-Anweisung konnte nicht erzeugt werden',
    );
  });
  it('führt genau die vom Server quotierten Anweisungen aus', async () => {
    const ausgefuehrt: string[] = [];
    const db = {
      query: async (sql: string, werte?: unknown[]) => {
        if (werte) return { rows: [{ anweisung: `ANWEISUNG ${werte.length}` }] };
        ausgefuehrt.push(sql);
        return { rows: [] };
      },
    };
    await richteAppLoginEin(db as never, 'x'.repeat(20));
    expect(ausgefuehrt).toEqual(['ANWEISUNG 2', 'ANWEISUNG 1']);
  });
});
