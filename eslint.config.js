import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      'coverage/**',
      'apps/web/**/*.astro',
      '.semgrep/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          // Zusätzlich zu Semgrep: keine Template-Strings mit Interpolation als SQL an query()
          selector:
            "CallExpression[callee.property.name='query'] > TemplateLiteral.arguments:first-child[expressions.length>0]",
          message: 'SQL nie per Interpolation bauen – Platzhalter ($1) verwenden.',
        },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'pg', 'fastify', '@fastify/*', 'astro*'],
              message: 'Core bleibt frei von Frameworks/Treibern (DIP).',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/infrastructure/postgres/{migrate,seed}.ts'], rules: { 'no-console': 'off' } },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
  { files: ['**/test/**'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
  {
    files: ['scripts/**/*.mjs', 'apps/web/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  prettier,
);
