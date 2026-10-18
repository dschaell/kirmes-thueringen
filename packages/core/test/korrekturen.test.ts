import { describe, expect, it, vi } from 'vitest';
import {
  Korrekturen,
  pruefeKorrektur,
  type KorrekturRepository,
  type Sitzungen,
} from '../src/index.js';

const ID = '837e5b5e-4ce6-41bf-9fe2-d4ee50554823';
function setup() {
  const repo = {
    lege: vi.fn(async () => true),
    liste: vi.fn(async () => []),
    anzahl: vi.fn(async () => 3),
    erledige: vi.fn(async () => true),
    raeumeAuf: vi.fn(async () => undefined),
  } satisfies KorrekturRepository;
  const sitzungen: Sitzungen = {
    pruefe: vi.fn(async (t: string) =>
      t === 'gut' ? { adminId: '7', name: 'R', rolle: 'redaktion' as const } : null,
    ),
    lege: vi.fn(),
    beende: vi.fn(),
  };
  const post = { sende: vi.fn(async () => undefined) };
  const ip = { erlaube: vi.fn(() => true) };
  const gesamt = { erlaube: vi.fn(() => true) };
  const k = new Korrekturen(repo, sitzungen, post, ip, gesamt, 'https://example.org/');
  return { k, repo, post, ip };
}
const gut = { text: 'Beginn ist 19 Uhr', dauerMs: 4000 };

describe('Korrekturhinweise (#107)', () => {
  it('prüft Text, Kontakt und Termin-ID', () => {
    expect(pruefeKorrektur(ID, { text: ' Zeile1\nZeile2\u0001 ', kontaktName: ' KG ' })).toEqual({
      ok: true,
      value: { terminId: ID, text: 'Zeile1\nZeile2', kontaktName: 'KG', kontaktEmail: null },
    });
    const f = pruefeKorrektur('x', { text: '', kontaktEmail: 'kaputt' });
    expect(f.ok).toBe(false);
    expect(!f.ok && f.error.map((e) => e.feld)).toEqual(['termin', 'text', 'kontaktEmail']);
    expect(pruefeKorrektur(ID, { text: 'x'.repeat(2001) }).ok).toBe(false);
    expect(pruefeKorrektur(ID, { text: 'ok', kontaktName: 'n'.repeat(121) }).ok).toBe(false);
  });
  it('speichert, mailt ohne Inhalte und schluckt Bots still', async () => {
    const { k, repo, post } = setup();
    expect(await k.melde(ID, gut, 'ip')).toEqual({ ok: true, value: { angenommen: true } });
    expect(repo.lege).toHaveBeenCalledOnce();
    expect(post.sende.mock.calls[0]?.[0].text).toContain('https://example.org/admin/vorschlaege');
    expect(post.sende.mock.calls[0]?.[0].text).not.toContain('19 Uhr');
    await k.melde(ID, { ...gut, falle: 'spam' }, 'ip');
    await k.melde(ID, { ...gut, dauerMs: 100 }, 'ip');
    expect(repo.lege).toHaveBeenCalledOnce();
  });
  it('Drosselung, unbekannter Termin, Mailfehler', async () => {
    const { k, repo, post, ip } = setup();
    post.sende.mockRejectedValueOnce(new Error('smtp'));
    expect((await k.melde(ID, gut, 'ip')).ok).toBe(true);
    repo.lege.mockResolvedValueOnce(false);
    expect(await k.melde(ID, gut, 'ip')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
    expect((await k.melde(ID, { text: '', dauerMs: 4000 }, 'ip')).ok).toBe(false);
    ip.erlaube.mockReturnValueOnce(false);
    expect(await k.melde(ID, gut, 'ip')).toEqual({ ok: false, error: 'ZU_VIELE' });
  });
  it('nur Redaktion liest und erledigt', async () => {
    const { k, repo } = setup();
    expect(await k.liste('')).toEqual({ ok: false, error: 'VERBOTEN' });
    expect(await k.anzahl('schlecht')).toEqual({ ok: false, error: 'VERBOTEN' });
    expect(await k.erledige('schlecht', ID)).toEqual({ ok: false, error: 'VERBOTEN' });
    expect(await k.liste('gut')).toEqual({ ok: true, value: [] });
    expect(await k.anzahl('gut')).toEqual({ ok: true, value: 3 });
    expect(await k.erledige('gut', ID)).toEqual({ ok: true, value: true });
    expect(repo.erledige).toHaveBeenCalledWith(ID, '7');
    expect(await k.erledige('gut', 'x')).toEqual({ ok: false, error: 'NICHT_GEFUNDEN' });
  });
});
