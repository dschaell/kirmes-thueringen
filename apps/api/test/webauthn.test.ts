import { describe, expect, it } from 'vitest';
import type { Passkey } from '@kirmes/core';
import { SimpleWebAuthn, SpeicherChallenges } from '../src/infrastructure/webauthn.js';
import { SoftwareAuthenticator } from './software-authenticator.js';

const ORIGIN = 'https://kirmes.example';
const admin = { id: '7', email: 'redaktion@kirmes.example' };

async function eingerichtet() {
  const w = new SimpleWebAuthn(ORIGIN);
  const geraet = new SoftwareAuthenticator(ORIGIN);
  const { challenge } = await w.registrierungsOptionen(admin, []);
  const s = await w.pruefeRegistrierung(geraet.registriere(challenge), challenge);
  const passkey: Passkey = {
    id: '1',
    adminId: admin.id,
    name: 'Test',
    erstelltAm: 'heute',
    zuletztGenutzt: null,
    ...s!,
  };
  return { w, geraet, passkey };
}

describe('SimpleWebAuthn (echte Signaturen, Software-Authenticator)', () => {
  it('Optionen: Domain als RP, Benutzerverifikation Pflicht, vorhandene Passkeys ausgeschlossen', async () => {
    const w = new SimpleWebAuthn(`${ORIGIN}/pfad`);
    const { optionen, challenge } = await w.registrierungsOptionen(admin, [
      { credentialId: 'vorhanden-abcdefghijk', transports: ['internal'] } as Passkey,
    ]);
    expect(optionen).toMatchObject({
      rp: { id: 'kirmes.example', name: 'Kirmeskalender Thüringen' },
      user: { name: admin.email },
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: [{ id: 'vorhanden-abcdefghijk' }],
    });
    expect(challenge.length).toBeGreaterThan(20);
    const a = await w.anmeldeOptionen();
    expect(a.optionen).toMatchObject({ rpId: 'kirmes.example', userVerification: 'required' });
  });

  it('richtet ein und meldet an – Signatur, Challenge und Zähler werden geprüft', async () => {
    const { w, geraet, passkey } = await eingerichtet();
    expect(passkey.credentialId).toBe(geraet.id);
    expect(passkey.transports).toEqual(['internal']);
    const { challenge } = await w.anmeldeOptionen();
    const antwort = geraet.melde(challenge, { zaehler: 3 });
    expect(w.credentialIdAus(antwort)).toBe(geraet.id);
    expect(await w.pruefeAnmeldung(antwort, challenge, passkey)).toEqual({ zaehler: 3 });
  });

  it('lehnt falsche Herkunft (Phishing-Seite), fremde Challenge und fehlende Verifikation ab', async () => {
    const { w, geraet, passkey } = await eingerichtet();
    const { challenge } = await w.anmeldeOptionen();
    const phishing = geraet.melde(challenge, { origin: 'https://kirmes-example.evil' });
    expect(await w.pruefeAnmeldung(phishing, challenge, passkey)).toBeNull();
    expect(
      await w.pruefeAnmeldung(geraet.melde('andere-challenge'), challenge, passkey),
    ).toBeNull();
    const ohneUv = geraet.melde(challenge, { verifiziert: false });
    expect(await w.pruefeAnmeldung(ohneUv, challenge, passkey)).toBeNull();
    // Antwort eines anderen Geräts passt nicht zum gespeicherten Schlüssel
    const fremd = new SoftwareAuthenticator(ORIGIN).melde(challenge);
    expect(await w.pruefeAnmeldung(fremd, challenge, passkey)).toBeNull();
  });

  it('Registrierung: falsche Herkunft und Müll werden abgelehnt', async () => {
    const w = new SimpleWebAuthn(ORIGIN);
    const { challenge } = await w.registrierungsOptionen(admin, []);
    const geraet = new SoftwareAuthenticator(ORIGIN);
    expect(
      await w.pruefeRegistrierung(
        geraet.registriere(challenge, { origin: 'https://x.evil' }),
        challenge,
      ),
    ).toBeNull();
    expect(await w.pruefeRegistrierung({ id: 'x' }, challenge)).toBeNull();
    const ohneTransports = await w.pruefeRegistrierung(
      geraet.registriere(challenge, { transports: [] }),
      challenge,
    );
    expect(ohneTransports?.transports).toEqual([]);
    expect(w.credentialIdAus({ id: 'kurz' })).toBeNull();
    expect(w.credentialIdAus(null)).toBeNull();
  });
});

describe('SpeicherChallenges', () => {
  it('genau einmal, nur für den richtigen Zweck, nur 5 Minuten', () => {
    let t = 0;
    const c = new SpeicherChallenges(5 * 60_000, 3, () => t);
    const v = c.lege('anmelden', 'ch', null);
    expect(c.nimm(v, 'einrichten')).toBeNull();
    const v2 = c.lege('einrichten', 'ch2', '1');
    expect(c.nimm(v2, 'einrichten')).toEqual({ challenge: 'ch2', adminId: '1' });
    expect(c.nimm(v2, 'einrichten')).toBeNull();
    const v3 = c.lege('anmelden', 'ch3', null);
    t = 5 * 60_000 + 1;
    expect(c.nimm(v3, 'anmelden')).toBeNull();
  });

  it('räumt Abgelaufenes auf und verdrängt bei Überfüllung die älteste', () => {
    let t = 0;
    const c = new SpeicherChallenges(1000, 2, () => t);
    const a = c.lege('anmelden', 'a', null);
    const b = c.lege('anmelden', 'b', null);
    c.lege('anmelden', 'c', null); // verdrängt a
    expect(c.nimm(a, 'anmelden')).toBeNull();
    expect(c.nimm(b, 'anmelden')?.challenge).toBe('b');
    t = 5000;
    const d = c.lege('anmelden', 'd', null);
    expect(c.nimm(d, 'anmelden')?.challenge).toBe('d');
  });
});
