/**
 * Versand an die Redaktion über SMTP (Brevo: smtp-relay.brevo.com:587, STARTTLS) und eine einfache
 * Drosselung im Speicher. Empfänger und Absender kommen nur aus der Konfiguration.
 */
import nodemailer from 'nodemailer';
import type { Drosselung, Nachricht, Postausgang } from '@kirmes/core';

export interface SmtpKonfiguration {
  host: string;
  port: number;
  benutzer: string;
  passwort: string;
  /** In Brevo verifizierter Absender, z. B. "Kirmeskalender Thüringen <noreply@…>" */
  von: string;
  /** Postfach der Redaktion */
  an: string;
  /** Nur für einen lokalen Test-Postfach-Server (Mailpit) abschaltbar – sonst immer TLS */
  tls?: boolean;
}

/** Nur das, was der Adapter vom Transport braucht (in Tests ersetzbar). */
export interface MailTransport {
  sendMail(m: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export const smtpTransport = (k: SmtpKonfiguration): MailTransport =>
  nodemailer.createTransport({
    host: k.host,
    port: k.port,
    secure: k.tls !== false && k.port === 465, // 465 = TLS von Anfang an, 587 = STARTTLS
    requireTLS: k.tls !== false, // nie unverschlüsselt – auch nicht, wenn STARTTLS fehlt
    ignoreTLS: k.tls === false,
    auth: { user: k.benutzer, pass: k.passwort },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

export class SmtpPostausgang implements Postausgang {
  constructor(
    private readonly k: Pick<SmtpKonfiguration, 'von' | 'an'>,
    private readonly transport: MailTransport,
  ) {}

  async sende(n: Nachricht): Promise<void> {
    await this.transport.sendMail({
      from: this.k.von,
      to: this.k.an,
      ...(n.antwortAn && { replyTo: n.antwortAn }),
      subject: n.betreff,
      text: n.text,
    });
  }
}

/** Höchstens `max` Vorgänge je Schlüssel im gleitenden Zeitfenster. */
export class SpeicherDrosselung implements Drosselung {
  private readonly zeiten = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly fensterMs: number,
    private readonly jetzt: () => number = Date.now,
  ) {}

  erlaube(schluessel: string): boolean {
    const t = this.jetzt();
    if (this.zeiten.size > 10_000) this.zeiten.clear(); // Schutz vor Speicherüberlauf
    const liste = (this.zeiten.get(schluessel) ?? []).filter((z) => z > t - this.fensterMs);
    if (liste.length >= this.max) {
      this.zeiten.set(schluessel, liste);
      return false;
    }
    this.zeiten.set(schluessel, [...liste, t]);
    return true;
  }
}
