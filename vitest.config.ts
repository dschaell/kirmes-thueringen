import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Lokale .env laden (TEST_DATABASE_URL für Integrationstests)
try {
  process.loadEnvFile('.env');
} catch {
  /* keine .env – z. B. in CI */
}

export default defineConfig({
  resolve: {
    // Tests laufen gegen die Quellen, nicht gegen gebaute dist/-Dateien
    alias: {
      '@kirmes/core': fileURLToPath(new URL('packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/api/test/**/*.test.ts',
      'apps/web/test/**/*.test.ts',
      'scripts/test/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'apps/api/src/**'],
      // CLIs und Composition Root werden über Docker/DAST end-to-end geprüft
      exclude: [
        'apps/api/src/main.ts',
        'apps/api/src/infrastructure/postgres/{migrate,orte,beispiele,termine-import,links,admin-cli,lastdaten-cli}.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 },
    },
  },
});
