import { mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leseSicherungen } from '../src/infrastructure/sicherungen.js';

const verzeichnis = () => mkdtemp(join(tmpdir(), 'sicherungen-'));

describe('leseSicherungen', () => {
  it('liest Status und nur bekannte Sicherungsdateien, neueste zuerst', async () => {
    const d = await verzeichnis();
    await writeFile(
      join(d, 'status.json'),
      JSON.stringify({
        zeit: '2026-10-19T03:00:00Z',
        lokal: 'ok',
        datei: 'kirmes-2026-10-19.dump',
        groesse: 1234,
        anzahl: 2,
        offsite: 'ok',
        meldung: '',
      }),
    );
    await writeFile(join(d, 'kirmes-2026-10-18.dump'), 'a');
    await writeFile(join(d, 'kirmes-2026-10-19.dump'), 'abc');
    await writeFile(join(d, 'vor-update-2026-10-17-120000.dump'), 'ab');
    await writeFile(join(d, 'kirmes-2026-10-19.dump.teil'), 'x');
    await writeFile(join(d, 'geheim.txt'), 'x');
    await utimes(
      join(d, 'vor-update-2026-10-17-120000.dump'),
      new Date('2026-10-17'),
      new Date('2026-10-17'),
    );
    await utimes(join(d, 'kirmes-2026-10-18.dump'), new Date('2026-10-18'), new Date('2026-10-18'));
    await utimes(join(d, 'kirmes-2026-10-19.dump'), new Date('2026-10-19'), new Date('2026-10-19'));
    const u = await leseSicherungen(d);
    expect(u.status).toEqual({
      zeit: '2026-10-19T03:00:00Z',
      lokal: 'ok',
      datei: 'kirmes-2026-10-19.dump',
      groesse: 1234,
      offsite: 'ok',
      meldung: '',
    });
    expect(u.dateien.map((f) => [f.name, f.groesse])).toEqual([
      ['kirmes-2026-10-19.dump', 3],
      ['kirmes-2026-10-18.dump', 1],
      ['vor-update-2026-10-17-120000.dump', 2],
    ]);
  });

  it('höchstens zehn Dateien', async () => {
    const d = await verzeichnis();
    for (let i = 1; i <= 12; i++)
      await writeFile(join(d, `kirmes-2026-10-${String(i).padStart(2, '0')}.dump`), 'x');
    expect((await leseSicherungen(d)).dateien).toHaveLength(10);
  });

  it.each([
    ['kaputt', '{'],
    ['ohne Zeit', '{"lokal":"ok"}'],
    ['ungültige Zeit', '{"zeit":"gestern"}'],
  ])('Status %s → null', async (_, inhalt) => {
    const d = await verzeichnis();
    await writeFile(join(d, 'status.json'), inhalt);
    expect((await leseSicherungen(d)).status).toBeNull();
  });

  it('unbekannte Werte werden entschärft', async () => {
    const d = await verzeichnis();
    await writeFile(
      join(d, 'status.json'),
      JSON.stringify({
        zeit: '2026-10-19T03:00:00Z',
        lokal: 'ja',
        datei: '../etc/passwd',
        groesse: -1,
        offsite: 'vielleicht',
        meldung: 7,
      }),
    );
    expect((await leseSicherungen(d)).status).toEqual({
      zeit: '2026-10-19T03:00:00Z',
      lokal: 'fehler',
      datei: '',
      groesse: 0,
      offsite: 'aus',
      meldung: '',
    });
  });

  it('fehlendes Verzeichnis → leer', async () => {
    expect(await leseSicherungen(join(tmpdir(), 'gibt-es-nicht-' + Date.now()))).toEqual({
      status: null,
      dateien: [],
    });
  });
});
