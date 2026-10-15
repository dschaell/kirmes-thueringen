/**
 * WebAuthn-Adapter (SimpleWebAuthn) und Speicher für einmalige Challenges.
 * Relying Party ist die Website: RP-ID = Hostname, erwartete Herkunft = Origin aus WEBSITE_URL.
 */
import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Challenges, Passkey, RegistrierterSchluessel, WebAuthn } from '@kirmes/core';

export class SimpleWebAuthn implements WebAuthn {
  private readonly rpID: string;
  private readonly origin: string;

  constructor(
    websiteUrl: string,
    private readonly rpName = 'Kirmeskalender Thüringen',
  ) {
    const u = new URL(websiteUrl);
    this.rpID = u.hostname;
    this.origin = u.origin;
  }

  async registrierungsOptionen(admin: { id: string; email: string }, vorhandene: Passkey[]) {
    const optionen = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: admin.email,
      userID: new TextEncoder().encode(`admin-${admin.id}`),
      attestationType: 'none',
      excludeCredentials: vorhandene.map((p) => ({ id: p.credentialId, transports: p.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    return { optionen, challenge: optionen.challenge };
  }

  async pruefeRegistrierung(
    antwort: unknown,
    challenge: string,
  ): Promise<RegistrierterSchluessel | null> {
    try {
      const r = await verifyRegistrationResponse({
        response: antwort as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
      if (!r.verified) return null;
      const c = r.registrationInfo.credential;
      return {
        credentialId: c.id,
        publicKey: c.publicKey,
        zaehler: c.counter,
        transports: c.transports ?? [],
      };
    } catch {
      return null;
    }
  }

  async anmeldeOptionen() {
    // Ohne allowCredentials: der Browser bietet alle Passkeys dieser Website an (auffindbare Schlüssel)
    const optionen = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'required',
    });
    return { optionen, challenge: optionen.challenge };
  }

  credentialIdAus(antwort: unknown): string | null {
    const id = (antwort as { id?: unknown } | null)?.id;
    return typeof id === 'string' && /^[A-Za-z0-9_-]{16,1400}$/.test(id) ? id : null;
  }

  async pruefeAnmeldung(antwort: unknown, challenge: string, passkey: Passkey) {
    try {
      const r = await verifyAuthenticationResponse({
        response: antwort as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: passkey.publicKey as Uint8Array<ArrayBuffer>,
          counter: passkey.zaehler,
          transports: passkey.transports as never,
        },
        requireUserVerification: true,
      });
      return r.verified ? { zaehler: r.authenticationInfo.newCounter } : null;
    } catch {
      return null;
    }
  }
}

/** Challenges im Speicher: 5 Minuten gültig, genau einmal abrufbar, höchstens 500 offen. */
export class SpeicherChallenges implements Challenges {
  private readonly offen = new Map<
    string,
    { zweck: string; challenge: string; adminId: string | null; bis: number }
  >();

  constructor(
    private readonly gueltigMs = 5 * 60_000,
    private readonly max = 500,
    private readonly jetzt: () => number = Date.now,
  ) {}

  lege(zweck: 'einrichten' | 'anmelden', challenge: string, adminId: string | null): string {
    const t = this.jetzt();
    for (const [k, v] of this.offen) if (v.bis < t) this.offen.delete(k);
    // Überfüllt: die älteste offene Challenge verdrängen (Map behält die Einfügereihenfolge)
    if (this.offen.size >= this.max) this.offen.delete([...this.offen.keys()][0] ?? '');
    const vorgang = randomBytes(24).toString('base64url');
    this.offen.set(vorgang, { zweck, challenge, adminId, bis: t + this.gueltigMs });
    return vorgang;
  }

  nimm(vorgang: string, zweck: 'einrichten' | 'anmelden') {
    const c = this.offen.get(vorgang);
    this.offen.delete(vorgang);
    if (!c || c.zweck !== zweck || c.bis < this.jetzt()) return null;
    return { challenge: c.challenge, adminId: c.adminId };
  }
}
