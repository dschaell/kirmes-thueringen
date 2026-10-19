import { describe, expect, it } from 'vitest';
import { ladeKonfiguration } from '../src/config.js';
import { SystemUhr } from '../src/infrastructure/system-uhr.js';

describe('ladeKonfiguration', () => {
  it('bricht ohne DATABASE_URL ab', () => {
    expect(() => ladeKonfiguration({})).toThrow('DATABASE_URL fehlt');
  });
  it('liest Werte und setzt sichere Standards', () => {
    expect(ladeKonfiguration({ DATABASE_URL: 'postgres://x' })).toEqual({
      port: 3100,
      host: '0.0.0.0',
      databaseUrl: 'postgres://x',
      dbSsl: false,
      logLevel: 'info',
      websiteUrl: null,
      smtp: null,
      sicherungen: null,
    });
    expect(
      ladeKonfiguration({ DATABASE_URL: 'x', SICHERUNGEN_VERZEICHNIS: '/sicherungen' }).sicherungen,
    ).toBe('/sicherungen');
    expect(
      ladeKonfiguration({ DATABASE_URL: 'x', WEBSITE_URL: 'https://kirmes.example' }).websiteUrl,
    ).toBe('https://kirmes.example');
  });
});

describe('SystemUhr', () => {
  it('liefert ein ISO-Kalenderdatum', () => {
    expect(new SystemUhr().heute()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
