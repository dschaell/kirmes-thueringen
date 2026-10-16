import { describe, expect, it } from 'vitest';
import { NodeKryptografie, SpeicherAnmeldeversuche } from '../src/infrastructure/krypto.js';

describe('NodeKryptografie (nur Zufall – Anmeldung per Passkey)', () => {
  const k = new NodeKryptografie();
  it('Token: 256 Bit, URL-tauglich, nie gleich', () => {
    const t = k.neuesToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 100 }, () => k.neuesToken())).size).toBe(100);
  });
  it('Kennung: zufällige UUID ohne Bezug zur Person', () => {
    expect(k.neueKennung()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(k.neueKennung()).not.toBe(k.neueKennung());
  });
});

describe('Anmeldeversuche', () => {
  it('sperrt nach 5 Fehlversuchen je E-Mail für 15 Minuten', () => {
    let jetzt = 0;
    const v = new SpeicherAnmeldeversuche(5, 30, () => jetzt);
    for (let i = 0; i < 5; i++) v.fehlschlag('a@b.de');
    expect(v.gesperrt('a@b.de')).toBe(true);
    expect(v.gesperrt('c@d.de')).toBe(false);
    jetzt = 15 * 60_000 + 1;
    expect(v.gesperrt('a@b.de')).toBe(false);
  });

  it('sperrt alle nach zu vielen Fehlversuchen insgesamt', () => {
    const v = new SpeicherAnmeldeversuche(5, 3, () => 0);
    v.fehlschlag('a@x.de');
    v.fehlschlag('b@x.de');
    v.fehlschlag('c@x.de');
    expect(v.gesperrt('neu@x.de')).toBe(true);
  });

  it('setzt den Zähler nach erfolgreicher Anmeldung zurück', () => {
    const v = new SpeicherAnmeldeversuche(2, 30, () => 0);
    v.fehlschlag('a@b.de');
    v.erfolg('a@b.de');
    v.fehlschlag('a@b.de');
    expect(v.gesperrt('a@b.de')).toBe(false);
  });
});
