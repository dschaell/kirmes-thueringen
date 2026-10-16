/**
 * Kryptografie für den Redaktionszugang – nur Node-Bordmittel, keine Abhängigkeiten.
 * - Passwörter: scrypt (N=2^15, r=8, p=1), Salz 16 Byte, Vergleich in konstanter Zeit
 * - Einmalcodes: TOTP nach RFC 6238 (SHA-1, 30 s, 6 Ziffern) – kompatibel mit allen Authenticator-Apps
 */
import type { Anmeldeversuche, Kryptografie, EinrichtungsKrypto } from '@kirmes/core';
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, laenge: 64 };

function scryptAsync(
  passwort: string,
  salz: Buffer,
  N: number,
  r: number,
  p: number,
  laenge: number,
) {
  return new Promise<Buffer>((auf, ab) =>
    scrypt(passwort, salz, laenge, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) =>
      e ? ab(e) : auf(k),
    ),
  );
}

export async function hashePasswort(passwort: string): Promise<string> {
  const salz = randomBytes(16);
  const hash = await scryptAsync(passwort, salz, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.laenge);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salz.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────────────────
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 Base32 ohne Auffüllzeichen. */
export function base32Kodieren(daten: Uint8Array): string {
  let bits = '';
  for (const b of daten) bits += b.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? []).map((t) => BASE32[parseInt(t.padEnd(5, '0'), 2)]).join('');
}

/**
 * 160 Bit Zufall (RFC 4226 empfiehlt 160) als 32 Base32-Zeichen – ganze Bytes. Kürzere oder
 * „krumme“ Schlüssel (z. B. 20 Zeichen = 100 Bit) lehnen viele Authenticator-Apps ab (#51).
 */
export const neuesTotpGeheimnis = (): string => base32Kodieren(randomBytes(20));

function base32Dekodieren(s: string): Buffer {
  let bits = '';
  for (const z of s.replace(/=+$/, '').toUpperCase()) {
    const i = BASE32.indexOf(z);
    if (i < 0) throw new Error('Ungültiges Base32');
    bits += i.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
}

export function totp(geheimnis: string, zeitSchritt: number): string {
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(zeitSchritt));
  const h = createHmac('sha1', base32Dekodieren(geheimnis)).update(zaehler).digest();
  const offset = (h.at(-1) ?? 0) & 0xf;
  const zahl = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return zahl.toString().padStart(6, '0');
}

export const otpauthUrl = (email: string, geheimnis: string) =>
  `otpauth://totp/${encodeURIComponent(`Kirmeskalender Thüringen:${email}`)}?secret=${geheimnis}&issuer=${encodeURIComponent('Kirmeskalender Thüringen')}&digits=6&period=30`;

export class NodeKryptografie implements Kryptografie, EinrichtungsKrypto {
  /** Zuletzt verwendeter Zeitschritt je Geheimnis – ein Code gilt nur einmal (Schutz vor Wiederverwendung). */
  private readonly benutzt = new Map<string, number>();

  constructor(private readonly jetzt: () => number = Date.now) {}

  hashePasswort = hashePasswort;
  neuesTotpGeheimnis = neuesTotpGeheimnis;

  /** Beschädigte oder fremde Hash-Formate ergeben „falsch“ – nie einen Serverfehler. */
  async pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
    const [art, n, r, p, salz, hash] = gespeichert.split('$');
    if (art !== 'scrypt' || !salz || !hash) return false;
    const soll = Buffer.from(hash, 'base64');
    try {
      const ist = await scryptAsync(
        passwort,
        Buffer.from(salz, 'base64'),
        Number(n),
        Number(r),
        Number(p),
        soll.length,
      );
      return timingSafeEqual(soll, ist);
    } catch {
      return false;
    }
  }

  pruefeEinmalcode(geheimnis: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const schritt = Math.floor(this.jetzt() / 30_000);
    for (const s of [schritt, schritt - 1, schritt + 1]) {
      if (s <= (this.benutzt.get(geheimnis) ?? -1)) continue;
      const erwartet = Buffer.from(totp(geheimnis, s));
      if (timingSafeEqual(erwartet, Buffer.from(code))) {
        this.benutzt.set(geheimnis, s);
        return true;
      }
    }
    return false;
  }

  neuesToken(): string {
    return randomBytes(32).toString('base64url');
  }
}

/**
 * Fehlversuche im Speicher (ein API-Prozess): je E-Mail max. 5 in 15 Minuten,
 * insgesamt max. 30 – danach 15 Minuten Sperre. Schützt vor dem Durchprobieren von Passwörtern.
 */
export class SpeicherAnmeldeversuche implements Anmeldeversuche {
  private readonly fenster = 15 * 60_000;
  private readonly jeEmail = new Map<string, number[]>();
  private gesamt: number[] = [];

  constructor(
    private readonly maxJeEmail = 5,
    private readonly maxGesamt = 30,
    private readonly jetzt: () => number = Date.now,
  ) {}

  private aktuell(liste: number[]) {
    const grenze = this.jetzt() - this.fenster;
    return liste.filter((t) => t > grenze);
  }

  gesperrt(email: string): boolean {
    this.gesamt = this.aktuell(this.gesamt);
    return (
      this.aktuell(this.jeEmail.get(email) ?? []).length >= this.maxJeEmail ||
      this.gesamt.length >= this.maxGesamt
    );
  }

  fehlschlag(email: string): void {
    this.jeEmail.set(email, [...this.aktuell(this.jeEmail.get(email) ?? []), this.jetzt()]);
    this.gesamt = [...this.aktuell(this.gesamt), this.jetzt()];
  }

  erfolg(email: string): void {
    this.jeEmail.delete(email);
  }
}
