/**
 * Zufall für den Redaktionszugang – nur Node-Bordmittel. Angemeldet wird mit Passkey (webauthn.ts);
 * Passwörter und Einmalcodes gibt es nicht mehr (Issue #56).
 */
import type { Anmeldeversuche, Kennungen, Kryptografie } from '@kirmes/core';
import { randomBytes, randomUUID } from 'node:crypto';

export class NodeKryptografie implements Kryptografie, Kennungen {
  /** 256 Bit, URL-tauglich – für Sitzungen und Links */
  neuesToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Zufällige WebAuthn-Kennung (user.id) eines neuen Kontos */
  neueKennung(): string {
    return randomUUID();
  }
}

/**
 * Fehlversuche im Speicher (ein API-Prozess): je Schlüssel max. 5 in 15 Minuten,
 * insgesamt max. 30 – danach 15 Minuten Sperre. Schützt vor dem Durchprobieren.
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
