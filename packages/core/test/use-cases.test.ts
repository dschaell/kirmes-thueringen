import { describe, expect, it } from 'vitest';
import {
  baueFilter,
  LegeTerminAn,
  SucheTermine,
  type KalenderDatum,
  type NeuerTermin,
  type Termin,
  type TerminFilter,
  type TerminRepository,
  type Uhr,
} from '../src/index.js';

const uhr: Uhr = { heute: () => '2026-10-14' as KalenderDatum };

class FakeRepo implements TerminRepository {
  letzterFilter: TerminFilter | null = null;
  gespeichert: NeuerTermin[] = [];
  async suche(filter: TerminFilter) {
    this.letzterFilter = filter;
    return { eintraege: [], gesamt: 0 };
  }
  async speichere(t: NeuerTermin): Promise<Termin> {
    this.gespeichert.push(t);
    return {
      id: 'id-1',
      ort: { slug: t.ortSlug, name: 'Mühlberg', landkreis: t.landkreis, koordinate: null },
      datum: t.datum,
      beginn: t.beginn,
      titel: t.titel,
      veranstaltungsort: t.veranstaltungsort,
      kategorie: t.kategorie,
      bestaetigt: t.bestaetigt,
    };
  }
}

describe('baueFilter', () => {
  it('nutzt heute + 365 Tage als Standard', () => {
    const r = baueFilter({}, uhr);
    expect(r.ok && r.value.bereich).toEqual({ von: '2026-10-14', bis: '2027-10-14' });
    expect(r.ok && r.value.limit).toBe(50);
  });

  it('übernimmt gültige Filter', () => {
    const r = baueFilter(
      {
        von: '2026-10-01',
        bis: '2026-10-31',
        landkreise: ['gth', 'IK'],
        kategorien: ['kinder'],
        q: '  Mühlberg ',
        nurBestaetigt: true,
        limit: 10,
        offset: 20,
      },
      uhr,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        bereich: { von: '2026-10-01', bis: '2026-10-31' },
        landkreise: ['GTH', 'IK'],
        kategorien: ['kinder'],
        suchtext: 'Mühlberg',
        nurBestaetigt: true,
        limit: 10,
        offset: 20,
      },
    });
  });

  it('meldet alle ungültigen Parameter', () => {
    const r = baueFilter(
      {
        von: 'gestern',
        landkreise: ['BY'],
        kategorien: ['zirkus'],
        q: 'x'.repeat(101),
        limit: 0,
        offset: -1,
      },
      uhr,
    );
    expect(!r.ok && r.error.map((f) => f.code)).toEqual([
      'DATUM_UNGUELTIG',
      'LANDKREIS_UNBEKANNT',
      'KATEGORIE_UNBEKANNT',
      'SUCHE_ZU_LANG',
      'LIMIT_UNGUELTIG',
      'OFFSET_UNGUELTIG',
    ]);
  });

  it('lehnt umgekehrten Zeitraum ab', () => {
    const r = baueFilter({ von: '2026-12-01', bis: '2026-11-01' }, uhr);
    expect(!r.ok && r.error[0]?.code).toBe('BEREICH_UMGEKEHRT');
  });
});

describe('SucheTermine', () => {
  it('ruft Repository nur mit gültigem Filter auf', async () => {
    const repo = new FakeRepo();
    const uc = new SucheTermine(repo, uhr);
    expect((await uc.ausfuehren({ limit: 999 })).ok).toBe(false);
    expect(repo.letzterFilter).toBeNull();
    expect((await uc.ausfuehren({ landkreise: ['WL'] })).ok).toBe(true);
    expect(repo.letzterFilter?.landkreise).toEqual(['WL']);
  });
});

describe('LegeTerminAn', () => {
  it('speichert gültige Termine und reicht Hinweise durch', async () => {
    const repo = new FakeRepo();
    const r = await new LegeTerminAn(repo).ausfuehren({
      ortSlug: 'muehlberg',
      landkreis: 'GTH',
      datum: '2026-05-02',
      titel: 'Maikirmes',
      kategorie: 'kirmes',
    });
    expect(r.ok && r.value.hinweise[0]?.code).toBe('KIRMES_AUSSERHALB_HERBST');
    expect(repo.gespeichert).toHaveLength(1);
  });

  it('speichert ungültige Termine nicht', async () => {
    const repo = new FakeRepo();
    const r = await new LegeTerminAn(repo).ausfuehren({
      ortSlug: 'x',
      landkreis: 'GTH',
      datum: 'kaputt',
      titel: 'T',
      kategorie: 'kirmes',
    });
    expect(r.ok).toBe(false);
    expect(repo.gespeichert).toHaveLength(0);
  });
});
