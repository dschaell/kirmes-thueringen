/** Konfiguration ausschließlich aus Umgebungsvariablen (12-Factor). Fehlt etwas, bricht der Start ab. */
export interface Konfiguration {
  port: number;
  host: string;
  databaseUrl: string;
  dbSsl: boolean;
  logLevel: string;
  /** Adresse der Website – Relying Party für Passkeys (RP-ID = Hostname) */
  websiteUrl: string | null;
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
  };
}
