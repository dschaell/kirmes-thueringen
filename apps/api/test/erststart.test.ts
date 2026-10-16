/** Erststart ohne Server-Shell (Issue #42): Konfiguration und Ortsverzeichnis ohne Datenbank. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ladeOrte,
  leseOrtsverzeichnis,
  sollOrteLaden,
} from '../src/infrastructure/postgres/erststart.js';

describe('sollOrteLaden', () => {
  it('nur bei ausdrücklichem ORTE_LADEN=ja', () => {
    expect(sollOrteLaden({ ORTE_LADEN: 'ja' })).toBe(true);
    expect(sollOrteLaden({ ORTE_LADEN: ' JA ' })).toBe(true);
    expect(sollOrteLaden({ ORTE_LADEN: 'nein' })).toBe(false);
    expect(sollOrteLaden({})).toBe(false);
  });
});

describe('leseOrtsverzeichnis', () => {
  it('liest das mitgelieferte Verzeichnis', async () => {
    const { orte, verworfen } = await leseOrtsverzeichnis();
    expect(orte.length).toBeGreaterThan(3000);
    expect(verworfen).toBe(0);
  });

  it('verwirft Koordinaten außerhalb Thüringens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orte-'));
    try {
      const datei = join(dir, 'orte.json');
      await writeFile(
        datei,
        JSON.stringify([
          { slug: 'gotha', name: 'Gotha', landkreis: 'GTH', lat: 50.95, lon: 10.7 },
          { slug: 'berlin', name: 'Berlin', landkreis: 'GTH', lat: 52.52, lon: 13.4 },
        ]),
      );
      const { orte, verworfen } = await leseOrtsverzeichnis(pathToFileURL(datei));
      expect(orte.map((o) => o.slug)).toEqual(['gotha']);
      expect(verworfen).toBe(1);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe('ohne rowCount (Treiber liefert null)', () => {
  it('zählt 0 statt abzustürzen', async () => {
    const db = { query: async () => ({ rows: [], rowCount: null }) };
    expect(await ladeOrte(db as never, [])).toBe(0);
  });
});
