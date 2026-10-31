/**
 * Versand über Web Push (Issue #348, ADR 024): VAPID-signiert, Inhalt Ende-zu-Ende verschlüsselt –
 * der Push-Dienst (Apple, Google, Mozilla, Microsoft) sieht den Text nicht.
 */
import type { PushNachricht, PushVersand, PushZiel, Zustellung } from '@kirmes/core';
import webpush from 'web-push';

export interface VapidKonfiguration {
  oeffentlich: string;
  privat: string;
  /** mailto: oder https: – Kontakt für die Push-Dienste */
  kontakt: string;
}

/** Nur was der Adapter braucht – in Tests ersetzbar */
export type SendeFunktion = (
  ziel: { endpoint: string; keys: { p256dh: string; auth: string } },
  inhalt: string,
  optionen: {
    TTL: number;
    urgency: 'normal';
    topic?: string;
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
  },
) => Promise<unknown>;

/** 404/410 = Gerät hat das Abo beendet; alles andere ist ein vorübergehender Fehler */
const abgemeldet = (e: unknown) => {
  const s = (e as { statusCode?: number } | null)?.statusCode;
  return s === 404 || s === 410;
};

export class WebPushVersand implements PushVersand {
  constructor(
    private readonly k: VapidKonfiguration,
    private readonly sendeNotification: SendeFunktion = webpush.sendNotification as unknown as SendeFunktion,
  ) {}

  async sende(ziel: PushZiel, n: PushNachricht): Promise<Zustellung> {
    try {
      await this.sendeNotification(
        { endpoint: ziel.endpoint, keys: { p256dh: ziel.p256dh, auth: ziel.auth } },
        JSON.stringify(n),
        {
          TTL: 24 * 60 * 60,
          urgency: 'normal',
          // Gleiches Thema ersetzt eine noch nicht zugestellte ältere Nachricht (max. 32 Zeichen)
          topic: n.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          vapidDetails: {
            subject: this.k.kontakt,
            publicKey: this.k.oeffentlich,
            privateKey: this.k.privat,
          },
        },
      );
      return 'zugestellt';
    } catch (e) {
      return abgemeldet(e) ? 'abgemeldet' : 'fehler';
    }
  }
}
