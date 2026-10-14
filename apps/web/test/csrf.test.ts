import { describe, expect, it } from 'vitest';
import { csrfGueltig } from '../src/lib/csrf';

describe('csrfGueltig', () => {
  const token = 'A'.repeat(43);
  it('akzeptiert nur das identische Token', () => {
    expect(csrfGueltig(token, token)).toBe(true);
    expect(csrfGueltig(token, 'B'.repeat(43))).toBe(false);
    expect(csrfGueltig(token, token.slice(1))).toBe(false); // andere Länge
  });
  it('lehnt fehlende Werte ab', () => {
    expect(csrfGueltig(undefined, token)).toBe(false);
    expect(csrfGueltig(token, null)).toBe(false);
    expect(csrfGueltig(token, undefined)).toBe(false);
    expect(csrfGueltig('', '')).toBe(false);
  });
});
