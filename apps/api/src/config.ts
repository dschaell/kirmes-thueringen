/** Konfiguration ausschließlich aus Umgebungsvariablen (12-Factor). Fehlt etwas, bricht der Start ab. */
export interface Konfiguration {
  port: number;
  host: string;
  databaseUrl: string;
  dbSsl: boolean;
  erlaubteOrigins: string[];
  logLevel: string;
}

export function ladeKonfiguration(env: NodeJS.ProcessEnv = process.env): Konfiguration {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL fehlt');
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    dbSsl: env.DB_SSL === 'true',
    erlaubteOrigins: (env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
