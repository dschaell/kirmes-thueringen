import { describe, expect, it } from 'vitest';
import { ladeKonfiguration } from '../src/config.js';
import {
  SmtpPostausgang,
  SpeicherDrosselung,
  smtpTransport,
  type MailTransport,
} from '../src/infrastructure/post.js';

describe('SmtpPostausgang', () => {
  it('schickt an die feste Redaktionsadresse, Antwort an die meldende Person', async () => {
    const gesendet: Parameters<MailTransport['sendMail']>[0][] = [];
    const post = new SmtpPostausgang(
      { von: 'Kirmeskalender <noreply@kirmes.example>', an: 'redaktion@kirmes.example' },
      { sendMail: async (m) => void gesendet.push(m) },
    );
    await post.sende({ betreff: 'Terminmeldung', text: 'Hallo', antwortAn: 'kg@ulla.de' });
    expect(gesendet).toEqual([
      {
        from: 'Kirmeskalender <noreply@kirmes.example>',
        to: 'redaktion@kirmes.example',
        replyTo: 'kg@ulla.de',
        subject: 'Terminmeldung',
        text: 'Hallo',
      },
    ]);
  });

  it('Transport erzwingt TLS (STARTTLS auf 587, TLS auf 465)', () => {
    const basis = { host: 'smtp-relay.brevo.com', benutzer: 'u', passwort: 'p', von: 'a', an: 'b' };
    const t587 = smtpTransport({ ...basis, port: 587 }) as unknown as {
      options: { secure: boolean; requireTLS: boolean };
    };
    expect(t587.options).toMatchObject({ secure: false, requireTLS: true });
    const t465 = smtpTransport({ ...basis, port: 465 }) as unknown as {
      options: { secure: boolean };
    };
    expect(t465.options.secure).toBe(true);
  });
});

describe('SpeicherDrosselung', () => {
  it('lässt max Vorgänge je Schlüssel im Zeitfenster zu', () => {
    let t = 0;
    const d = new SpeicherDrosselung(2, 1000, () => t);
    expect([d.erlaube('a'), d.erlaube('a'), d.erlaube('a'), d.erlaube('b')]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    t = 1001;
    expect(d.erlaube('a')).toBe(true);
  });
});

describe('SMTP-Konfiguration', () => {
  const basis = { DATABASE_URL: 'x' };
  it('ohne SMTP-Variablen: kein Versand (mailto-Rückfall)', () => {
    expect(ladeKonfiguration(basis).smtp).toBeNull();
  });
  it('Brevo als Standard-Host, halbe Konfiguration bricht den Start ab', () => {
    expect(
      ladeKonfiguration({
        ...basis,
        SMTP_USER: 'abc@smtp-brevo.com',
        SMTP_PASS: 'geheim',
        MAIL_FROM: 'noreply@kirmes.example',
        MAIL_AN: 'redaktion@kirmes.example',
      }).smtp,
    ).toMatchObject({ host: 'smtp-relay.brevo.com', port: 587 });
    const lokal = {
      ...basis,
      SMTP_USER: 'x',
      SMTP_PASS: 'y',
      MAIL_FROM: 'a@b.de',
      MAIL_AN: 'c@d.de',
      SMTP_OHNE_TLS: 'nur-lokal',
    };
    expect(
      ladeKonfiguration({ ...lokal, SMTP_HOST: 'localhost', SMTP_PORT: '1025' }).smtp,
    ).toMatchObject({ tls: false, port: 1025 });
    expect(() => ladeKonfiguration(lokal)).toThrow('nur für einen lokalen Test-Server');
    const ohne = smtpTransport({
      host: 'localhost',
      port: 1025,
      benutzer: 'x',
      passwort: 'y',
      von: 'a',
      an: 'b',
      tls: false,
    }) as unknown as { options: { requireTLS: boolean; ignoreTLS: boolean } };
    expect(ohne.options).toMatchObject({ requireTLS: false, ignoreTLS: true });
    expect(() => ladeKonfiguration({ ...basis, SMTP_USER: 'abc' })).toThrow(
      'SMTP unvollständig, es fehlt: SMTP_PASS, MAIL_FROM, MAIL_AN',
    );
  });
});
