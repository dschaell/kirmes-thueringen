import { describe, expect, it } from 'vitest';
import { testDatenbankUrl } from './test-datenbank.js';

describe('testDatenbankUrl (Schutz der Arbeitsdatenbank)', () => {
  const arbeit = 'postgres://u:p@127.0.0.1:5432/kirmes';
  const test = 'postgres://u:p@127.0.0.1:5432/kirmes_test';

  it('nutzt lokal nur TEST_DATABASE_URL – nie DATABASE_URL', () => {
    expect(testDatenbankUrl({ DATABASE_URL: arbeit })).toBeUndefined();
    expect(testDatenbankUrl({ DATABASE_URL: arbeit, TEST_DATABASE_URL: test })).toBe(test);
  });

  it('verweigert lokal eine Datenbank ohne „_test“ im Namen', () => {
    expect(() => testDatenbankUrl({ TEST_DATABASE_URL: arbeit })).toThrow('keine Test-Datenbank');
  });

  it('erlaubt in CI den Service-Container über DATABASE_URL', () => {
    expect(testDatenbankUrl({ CI: 'true', DATABASE_URL: arbeit })).toBe(arbeit);
  });
});
