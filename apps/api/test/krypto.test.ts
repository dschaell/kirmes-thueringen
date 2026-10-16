import { describe, expect, it } from 'vitest';
import {
  hashePasswort,
  NodeKryptografie,
  base32Kodieren,
  neuesTotpGeheimnis,
  otpauthUrl,
  SpeicherAnmeldeversuche,
  totp,
} from '../src/infrastructure/krypto.js';

// RFC 6238, Anhang B: Geheimnis „12345678901234567890“ (ASCII) in Base32
const RFC_GEHEIMNIS = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP-Geheimnis (#51)', () => {
  it('hat 32 Base32-Zeichen = genau 20 Byte, wie Authenticator-Apps es erwarten', () => {
    for (let i = 0; i < 50; i++) {
      const g = neuesTotpGeheimnis();
      expect(g).toMatch(/^[A-Z2-7]{32}$/);
    }
    expect(neuesTotpGeheimnis()).not.toBe(neuesTotpGeheimnis());
  });
  it('kodiert nach RFC 4648 (Testvektoren)', () => {
    expect(base32Kodieren(Buffer.from('12345678901234567890'))).toBe(RFC_GEHEIMNIS);
    expect(base32Kodieren(Buffer.from('f'))).toBe('MY');
    expect(base32Kodieren(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Kodieren(Buffer.alloc(0))).toBe('');
  });
});

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('T=%i → %s', (sekunden, code) => {
    expect(totp(RFC_GEHEIMNIS, Math.floor(sekunden / 30))).toBe(code);
  });

  it('akzeptiert ±30 s, aber jeden Code nur einmal', () => {
    let jetzt = 59_000;
    const k = new NodeKryptografie(() => jetzt);
    expect(k.pruefeEinmalcode(RFC_GEHEIMNIS, '287082')).toBe(true);
    expect(k.pruefeEinmalcode(RFC_GEHEIMNIS, '287082')).toBe(false); // Wiederverwendung
    jetzt = 89_000; // nächster Zeitschritt
    expect(k.pruefeEinmalcode(RFC_GEHEIMNIS, totp(RFC_GEHEIMNIS, 2))).toBe(true);
    expect(k.pruefeEinmalcode(RFC_GEHEIMNIS, 'abcdef')).toBe(false);
    expect(k.pruefeEinmalcode(RFC_GEHEIMNIS, '000000')).toBe(false);
  });

  it('erzeugt Base32-Geheimnisse und otpauth-Links', () => {
    const g = neuesTotpGeheimnis();
    expect(g).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl('a@b.de', g)).toContain(`secret=${g}`);
  });
});

describe('Passwörter (scrypt)', () => {
  it('prüft richtig und falsch, lehnt fremde Formate ab', async () => {
    const k = new NodeKryptografie();
    const hash = await hashePasswort('kirmes-ist-schoen-2026');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await k.pruefePasswort('kirmes-ist-schoen-2026', hash)).toBe(true);
    expect(await k.pruefePasswort('kirmes-ist-schoen-2027', hash)).toBe(false);
    expect(await k.pruefePasswort('x', 'md5$abc')).toBe(false);
    expect(await hashePasswort('kirmes-ist-schoen-2026')).not.toBe(hash); // Salz
    expect(k.neuesToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
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

describe('Robustheit', () => {
  it('lehnt ungültiges Base32 im TOTP-Geheimnis ab', () => {
    expect(() => totp('UNGUELTIG1', 0)).toThrow('Ungültiges Base32');
  });

  it('gibt bei beschädigtem Passwort-Hash „falsch“ zurück statt abzustürzen', async () => {
    const k = new NodeKryptografie();
    expect(await k.pruefePasswort('x', 'scrypt$3$8$1$c2FsdA==$aGFzaA==')).toBe(false); // N keine Zweierpotenz
    expect(await k.pruefePasswort('x', 'scrypt$16384$8$1$c2FsdA==$')).toBe(false); // Hash fehlt
    expect(await k.pruefePasswort('x', '')).toBe(false);
  });
});
