import { describe, expect, it, vi } from 'vitest';
import {
  RedaktionsTermine,
  type KalenderDatum,
  type Sitzungen,
  type TerminRepository,
} from '../src/index.js';
function aufbau() {
  const repo = {
    suche: vi.fn(async () => ({ eintraege: [], gesamt: 0 })),
    finde: vi.fn(),
    speichere: vi.fn(),
  } as TerminRepository;
  const sitzungen: Sitzungen = {
    pruefe: vi.fn(async () => ({ adminId: '1', name: 'Test', rolle: 'redaktion' as const })),
    lege: vi.fn(),
    beende: vi.fn(),
  };
  const liste = new RedaktionsTermine(repo, sitzungen, {
    heute: () => '2026-10-16' as KalenderDatum,
  });
  return { repo, sitzungen, liste };
}
describe('Redaktions-Terminliste', () => {
  it('verlangt die Sitzung im Use Case vor jedem Datenzugriff', async () => {
    const { liste, repo, sitzungen } = aufbau();
    expect(await liste.liste('', {})).toEqual({ ok: false, error: 'VERBOTEN' });
    vi.mocked(sitzungen.pruefe).mockResolvedValue(null);
    expect(await liste.liste('abgelaufen', {})).toEqual({ ok: false, error: 'VERBOTEN' });
    vi.mocked(sitzungen.pruefe).mockResolvedValue({
      adminId: 'x',
      name: 'x',
      rolle: 'gast',
    } as never);
    expect(await liste.liste('gast', {})).toEqual({ ok: false, error: 'VERBOTEN' });
    expect(repo.suche).not.toHaveBeenCalled();
  });
  it('zeigt kommende Termine ohne künstliche Jahresgrenze, mit Standardpaginierung', async () => {
    const { liste, repo } = aufbau();
    expect((await liste.liste('token', {})).ok).toBe(true);
    expect(repo.suche).toHaveBeenCalledWith({
      bereich: { von: '2026-10-16', bis: '9999-12-31' },
      landkreise: [],
      kategorien: [],
      suchtext: null,
      ortSlug: null,
      nurBestaetigt: false,
      limit: 25,
      offset: 0,
    });
  });
  it('durchsucht vergangene oder alle Termine und gibt Filter samt Seite weiter', async () => {
    const { liste, repo, sitzungen } = aufbau();
    vi.mocked(sitzungen.pruefe).mockResolvedValue({ adminId: '1', name: 'Test', rolle: 'admin' });
    await liste.liste('token', {
      zeitraum: 'vergangen',
      q: ' Alkersleben\n ',
      limit: 10,
      offset: 20,
    });
    expect(repo.suche).toHaveBeenCalledWith(
      expect.objectContaining({
        bereich: { von: '0100-01-01', bis: '2026-10-15' },
        suchtext: 'Alkersleben',
        limit: 10,
        offset: 20,
      }),
    );
    await liste.liste('token', { zeitraum: 'alle', ort: 'alkersleben' });
    expect(repo.suche).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bereich: { von: '0100-01-01', bis: '9999-12-31' },
        ortSlug: 'alkersleben',
      }),
    );
  });
  it('„von“ zeigt eine gerade eingetragene Kirmes ab ihrem ersten Tag (Issue #90)', async () => {
    const { liste, repo } = aufbau();
    await liste.liste('token', { zeitraum: 'alle', ort: 'alkersleben', von: '2026-10-15' });
    expect(repo.suche).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bereich: { von: '2026-10-15', bis: '9999-12-31' },
        ortSlug: 'alkersleben',
      }),
    );
    const r = await liste.liste('token', { von: '2026-13-40' });
    expect(r.ok).toBe(false);
  });
  it('explizites Datum findet auch vergangene Termine unabhängig vom Umschalter', async () => {
    const { liste, repo } = aufbau();
    await liste.liste('token', { datum: '2020-09-18' });
    expect(repo.suche).toHaveBeenCalledWith(
      expect.objectContaining({ bereich: { von: '2020-09-18', bis: '2020-09-18' } }),
    );
  });
  it.each([
    { q: 'x'.repeat(101) },
    { ort: '../falsch' },
    { datum: '2027-02-30' },
    { zeitraum: 'falsch' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 1_000_001 },
    { offset: 0.5 },
  ])('weist ungültige Filter ab: %j', async (f) => {
    const { liste, repo } = aufbau();
    expect((await liste.liste('token', f)).ok).toBe(false);
    expect(repo.suche).not.toHaveBeenCalled();
  });
  it('leere Folgeseite erhält korrekte Gesamtzahl statt den Bestand als leer auszugeben', async () => {
    const { liste, repo } = aufbau();
    vi.mocked(repo.suche)
      .mockResolvedValueOnce({ eintraege: [], gesamt: 0 })
      .mockResolvedValueOnce({ eintraege: [], gesamt: 12 });
    expect(await liste.liste('token', { offset: 25 })).toEqual({
      ok: true,
      value: { eintraege: [], gesamt: 12 },
    });
    expect(repo.suche).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 1 }));
  });
  it('bei gefüllter Folgeseite ist keine zweite Abfrage nötig', async () => {
    const { liste, repo } = aufbau();
    vi.mocked(repo.suche).mockResolvedValue({ eintraege: [{}] as never, gesamt: 100 });
    expect((await liste.liste('token', { offset: 25 })).ok).toBe(true);
    expect(repo.suche).toHaveBeenCalledOnce();
  });
});
