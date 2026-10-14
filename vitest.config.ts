import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'apps/api/src/**'],
      // CLIs und Composition Root werden über Docker/DAST end-to-end geprüft
      exclude: [
        'apps/api/src/main.ts',
        'apps/api/src/infrastructure/postgres/{migrate,orte,beispiele,termine-import,links,admin-cli}.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 },
    },
  },
});
