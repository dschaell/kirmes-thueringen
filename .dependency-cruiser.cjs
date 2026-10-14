/** Schichtenregeln der Clean Architecture – Verstoß lässt `npm run lint` und CI fehlschlagen. */
module.exports = {
  forbidden: [
    {
      name: 'domain-ist-rein',
      severity: 'error',
      comment: 'Domain kennt weder Application noch Infrastruktur.',
      from: { path: '^packages/core/src/domain' },
      to: { path: '^packages/core/src/application|^apps/' },
    },
    {
      name: 'core-ohne-frameworks',
      severity: 'error',
      comment: 'Core hat keine Laufzeit-Abhängigkeiten (kein pg, fastify, node:*).',
      from: { path: '^packages/core/src' },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-no-pkg',
          'npm-unknown',
          'core',
        ],
      },
    },
    {
      name: 'http-nicht-direkt-auf-db',
      severity: 'error',
      comment: 'HTTP-Adapter spricht nur mit Use Cases, nie direkt mit PostgreSQL.',
      from: { path: '^apps/api/src/interfaces' },
      to: { path: '^apps/api/src/infrastructure|^node_modules/pg' },
    },
    {
      name: 'infrastruktur-nicht-auf-http',
      severity: 'error',
      from: { path: '^apps/api/src/infrastructure' },
      to: { path: '^apps/api/src/interfaces' },
    },
    { name: 'keine-zyklen', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '(^|/)(dist|test)/' },
  },
};
