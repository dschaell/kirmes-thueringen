/**
 * Verbindung für Integrationstests. Lokal NUR eine eigene Test-Datenbank (Name endet auf „_test“),
 * damit Tests nie die Arbeitsdatenbank der Redaktion berühren. In CI existiert der Service-Container
 * ausschließlich für Tests – dort ist DATABASE_URL erlaubt.
 */
export function testDatenbankUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.TEST_DATABASE_URL ?? (env.CI ? env.DATABASE_URL : undefined);
  if (url && !env.CI && !new URL(url).pathname.endsWith('_test')) {
    throw new Error(
      `Integrationstests verweigert: ${new URL(url).pathname.slice(1)} ist keine Test-Datenbank (Name muss auf „_test“ enden). ` +
        'Lokal „npm run test:db“ ausführen und TEST_DATABASE_URL setzen.',
    );
  }
  return url;
}
