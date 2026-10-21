import { describe, expect, it } from 'vitest';
import { RECHTE, darf, darfOrt, nurEigenerOrt, type Aktion } from '../src/index.js';

const admin = { rolle: 'admin' as const };
const redaktion = { rolle: 'redaktion' as const };
const kg = { rolle: 'kirmesgesellschaft' as const, ortSlug: 'muehlberg' };

describe('Rechte zentral (Issue #198)', () => {
  // Erwartung je Aktion: [admin, redaktion, kirmesgesellschaft]
  const tabelle: [Aktion, boolean, boolean, boolean][] = [
    ['redaktion', true, true, true],
    ['termine', true, true, true],
    ['termine.bestaetigen', false, false, true],
    ['plaetze', true, true, true],
    ['vorschlaege', true, true, true],
    ['korrekturen', true, true, true],
    ['orte.anlegen', true, true, false],
    ['orte.bearbeiten', true, true, false],
    ['mitteilungen', true, true, false],
    ['links', true, true, false],
    ['import', true, true, false],
    ['orte.loeschen', true, false, false],
    ['mitglieder', true, false, false],
    ['sicherungen', true, false, false],
  ];
  it.each(tabelle)('%s: Admin %s, Redaktion %s, KG %s', (aktion, a, r, k) => {
    expect([darf(admin, aktion), darf(redaktion, aktion), darf(kg, aktion)]).toEqual([a, r, k]);
  });
  it('Tabelle deckt alle Aktionen ab', () => {
    expect(tabelle.map(([x]) => x).sort()).toEqual(Object.keys(RECHTE).sort());
  });
  it('ortsgebundene Aktionen: KG nur am eigenen Ort, Moderation überall', () => {
    expect(darf(kg, 'termine', 'muehlberg')).toBe(true);
    expect(darf(kg, 'termine', 'erfurt')).toBe(false);
    expect(darf(kg, 'plaetze', 'erfurt')).toBe(false);
    expect(darf(redaktion, 'vorschlaege', 'erfurt')).toBe(true);
    // nicht ortsgebunden: Ort spielt keine Rolle
    expect(darf(admin, 'mitglieder', 'erfurt')).toBe(true);
    expect(darf({ rolle: 'kirmesgesellschaft', ortSlug: null }, 'termine', 'erfurt')).toBe(false);
  });
  it('ohne Sitzung oder mit unbekannter Rolle nichts', () => {
    expect(darf(null, 'redaktion')).toBe(false);
    expect(darf(undefined, 'termine')).toBe(false);
    expect(darf({ rolle: 'gast' } as never, 'termine')).toBe(false);
    expect(darfOrt(null, 'x')).toBe(false);
    expect([nurEigenerOrt(kg), nurEigenerOrt(admin), nurEigenerOrt(null)]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
