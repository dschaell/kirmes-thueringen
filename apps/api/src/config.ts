import type { SmtpKonfiguration } from './infrastructure/post.js';

/** Konfiguration ausschließlich aus Umgebungsvariablen (12-Factor). Fehlt etwas, bricht der Start ab. */
export interface Konfiguration {
  port: number;
  host: string;
  databaseUrl: string;
  dbSsl: boolean;
  logLevel: string;
  /** Adresse der Website – Relying Party für Passkeys (RP-ID = Hostname) */
  websiteUrl: string | null;
  /** SMTP für Meldungen an die Redaktion (Brevo); null = Formular nutzt mailto */
  smtp: SmtpKonfiguration | null;
  /** Nur lesend eingebundenes Sicherungsverzeichnis – Anzeige in der Redaktion (Issue #45) */
  sicherungen: string | null;
}

export function ladeKonfiguration(env: NodeJS.ProcessEnv = process.env): Konfiguration {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL fehlt');
  return {
    port: Number(env.API_PORT ?? 3100),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    dbSsl: env.DB_SSL === 'true',
    logLevel: env.LOG_LEVEL ?? 'info',
    websiteUrl: env.WEBSITE_URL || null,
    smtp: ladeSmtp(env),
    sicherungen: env.SICHERUNGEN_VERZEICHNIS || null,
  };
}

/** SMTP nur, wenn alles Nötige gesetzt ist – halbe Konfiguration ist ein Fehler. */
function ladeSmtp(env: NodeJS.ProcessEnv): SmtpKonfiguration | null {
  const pflicht = ['SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_AN'] as const;
  const gesetzt = pflicht.filter((k) => env[k]);
  if (gesetzt.length === 0) return null;
  const fehlt = pflicht.filter((k) => !env[k]);
  if (fehlt.length > 0) throw new Error(`SMTP unvollständig, es fehlt: ${fehlt.join(', ')}`);
  const host = env.SMTP_HOST || 'smtp-relay.brevo.com';
  // Ohne TLS nur gegen einen lokalen Test-Server (Mailpit) – nie gegen Brevo oder andere Hosts
  const ohneTls = env.SMTP_OHNE_TLS === 'nur-lokal';
  if (ohneTls && !['localhost', '127.0.0.1', 'mailpit'].includes(host)) {
    throw new Error('SMTP_OHNE_TLS ist nur für einen lokalen Test-Server erlaubt');
  }
  return {
    host,
    tls: !ohneTls,
    port: Number(env.SMTP_PORT || 587),
    benutzer: env.SMTP_USER ?? '',
    passwort: env.SMTP_PASS ?? '',
    von: env.MAIL_FROM ?? '',
    an: env.MAIL_AN ?? '',
  };
}
