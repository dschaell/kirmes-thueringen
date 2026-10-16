import { describe, expect, it } from 'vitest';
import { headerFuer } from '../sicherheits-header.mjs';

const csp = (pfad: string) =>
  (headerFuer(pfad) as Record<string, string>)['Content-Security-Policy'];
const coep = (pfad: string) =>
  (headerFuer(pfad) as Record<string, string>)['Cross-Origin-Embedder-Policy'];

describe('Google Maps nur auf Terminseiten und in der Termin-Redaktion (#62)', () => {
  it('erlaubt das Kartenfenster von Google nur dort', () => {
    for (const p of [
      '/termin/1529f2b9-4e05-41f5-b485-116ca63d7d41',
      '/admin/termine',
      '/admin/termine?ort=x',
    ]) {
      expect(csp(p), p).toContain('frame-src https://maps.google.com https://www.google.com');
      expect(coep(p), p).toBeUndefined();
    }
    for (const p of ['/', '/termine', '/admin/mitglieder', '/termin/x.ics', '/datenschutz']) {
      expect(csp(p), p).not.toContain('frame-src');
    }
    expect(coep('/')).toBe('require-corp');
  });
});
