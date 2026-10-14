import pg from 'pg';

export interface DbKonfiguration {
  connectionString: string;
  ssl: boolean;
  maxVerbindungen: number;
  statementTimeoutMs: number;
}

export function erstellePool(k: DbKonfiguration): pg.Pool {
  return new pg.Pool({
    connectionString: k.connectionString,
    ssl: k.ssl ? { rejectUnauthorized: true } : false,
    max: k.maxVerbindungen,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: k.statementTimeoutMs,
    application_name: 'kirmes-api',
  });
}

/** Verbindungsfehler (DB down, Netzwerk, Timeout) – im Gegensatz zu SQL-/Constraint-Fehlern. */
export function istVerbindungsfehler(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string }).code ?? '';
  return (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      '57P01',
      '57P03',
    ].includes(code) ||
    code.startsWith('08') || // connection_exception
    /timeout|Connection terminated/i.test(e.message)
  );
}
