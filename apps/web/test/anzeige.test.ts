import { describe, expect, it } from 'vitest';
import { heute, wochenende } from '../src/lib/anzeige';

describe('heute (Thüringer Ortszeit)', () => {
  it('kurz nach Mitternacht ist schon der neue Tag – auch wenn UTC noch gestern ist', () => {
    // 00:30 Uhr MESZ = 22:30 Uhr UTC am Vortag
    expect(heute(new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17');
    // 00:30 Uhr MEZ (Winterzeit) = 23:30 Uhr UTC am Vortag
    expect(heute(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('kurz vor Mitternacht ist noch derselbe Tag', () => {
    expect(heute(new Date('2026-10-16T21:59:00Z'))).toBe('2026-10-16');
  });
});

describe('wochenende', () => {
  it('ab Freitag bis Sonntag, am Wochenende ab heute', () => {
    expect(wochenende('2026-10-14')).toEqual({ von: '2026-10-16', bis: '2026-10-18' }); // Mi
    expect(wochenende('2026-10-17')).toEqual({ von: '2026-10-17', bis: '2026-10-18' }); // Sa
    expect(wochenende('2026-10-18')).toEqual({ von: '2026-10-18', bis: '2026-10-18' }); // So
  });
});
