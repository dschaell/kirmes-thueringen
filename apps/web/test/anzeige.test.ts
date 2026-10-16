import { describe, expect, it } from 'vitest';
import { heute, kreisZusammenfassung, ohneSchraegstrich, wochenende } from '../src/lib/anzeige';

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

describe('kreisZusammenfassung (#53)', () => {
  it('ist grammatisch richtig für 0, 1 und viele', () => {
    expect(kreisZusammenfassung(0, 0)).toBe('Noch keine kommenden Termine eingetragen.');
    expect(kreisZusammenfassung(1, 1)).toBe('1 kommender Termin in einem Ort.');
    expect(kreisZusammenfassung(3, 1)).toBe('3 kommende Termine in einem Ort.');
    expect(kreisZusammenfassung(1200, 14)).toBe('1.200 kommende Termine in 14 Orten.');
  });
});

describe('ohneSchraegstrich (#54)', () => {
  it('entfernt den abschließenden „/“, lässt die Startseite in Ruhe', () => {
    expect(ohneSchraegstrich('/impressum/')).toBe('/impressum');
    expect(ohneSchraegstrich('/impressum')).toBe('/impressum');
    expect(ohneSchraegstrich('/')).toBe('/');
    expect(ohneSchraegstrich('/orte/gotha//')).toBe('/orte/gotha');
  });
});
