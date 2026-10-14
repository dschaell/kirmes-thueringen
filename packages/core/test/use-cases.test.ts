import { describe, expect, it } from 'vitest';
import {
  baueFilter,
  FindeTermin,
  FindeOrt,
  ListeOrte,
  type OrtRepository,
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
  async finde(id: string): Promise<Termin | null> {
    this.gefragt.push(id);
    return null;
  }
  gefragt: string[] = [];
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
      festplatz: null,
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
        ortSlug: null,
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
        ort: 'Mühl berg',
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
      'SLUG_UNGUELTIG',
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

describe('ListeOrte / FindeOrt', () => {
  const ort = { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'GTH' as const, koordinate: null };
  const gefragt: string[] = [];
  const repo: OrtRepository = {
    liste: async (ab) => {
      gefragt.push(`liste:${ab}`);
      return [{ ort, anzahlKommend: 2 }];
    },
    finde: async (slug) => {
      gefragt.push(`finde:${slug}`);
      return slug === 'muehlberg' ? ort : null;
    },
  };

  it('listet Orte ab heute', async () => {
    expect(await new ListeOrte(repo, uhr).ausfuehren()).toEqual([{ ort, anzahlKommend: 2 }]);
    expect(gefragt).toContain('liste:2026-10-14');
  });

  it('fragt ungültige Slugs gar nicht erst an', async () => {
    const uc = new FindeOrt(repo);
    expect(await uc.ausfuehren('muehlberg')).toEqual(ort);
    expect(await uc.ausfuehren("x' OR 1=1")).toBeNull();
    expect(gefragt).not.toContain("finde:x' OR 1=1");
  });
});

describe('FindeTermin', () => {
  it('fragt nur gültige UUIDs bei der Datenbank an', async () => {
    const repo = new FakeRepo();
    const uc = new FindeTermin(repo);
    await uc.ausfuehren('kein-uuid');
    await uc.ausfuehren('6f1c0b6e-3d2a-4c1b-9f00-0123456789ab');
    expect(repo.gefragt).toEqual(['6f1c0b6e-3d2a-4c1b-9f00-0123456789ab']);
  });
});
