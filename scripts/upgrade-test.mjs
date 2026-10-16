#!/usr/bin/env node
/**
 * Upgrade-Test (Issue #59): Ein Update darf keine Zugänge und keine Daten der Nutzer verändern.
 *
 *   node scripts/upgrade-test.mjs <basis-ref>      (DATABASE_URL = beliebige DB auf dem Server)
 *
 * 1. legt die Datenbank kirmes_upgrade neu an und spielt die Migrationen des BASIS-Stands ein
 * 2. lädt db/upgrade-test/testdaten.sql (Konten, Passkeys, Sitzungen, Einladungen, Termine …)
 * 3. merkt sich jede Zeile jeder Tabelle
 * 4. migriert mit dem aktuellen Stand (npm run db:migrate)
 * 5. vergleicht: gleiche Zeilen, gleiche Werte in allen Spalten, die es vorher gab
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const basis = process.argv[2];
const quelle = process.env.DATABASE_URL;
if (!basis || !quelle) {
  console.error('Aufruf: DATABASE_URL=… node scripts/upgrade-test.mjs <basis-ref>');
  process.exit(2);
}
const ziel = new URL(quelle);
ziel.pathname = '/kirmes_upgrade';
const AUSGENOMMEN = new Set(['schema_migration', 'spatial_ref_sys', 'landkreis']);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });

async function mitVerbindung(url, fn) {
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const wert = (v) =>
  Buffer.isBuffer(v) ? `\\x${v.toString('hex')}` : v instanceof Date ? v.toISOString() : v;

/** Alle Zeilen aller Tabellen, je Tabelle nach der ersten Spalte (Schlüssel) sortiert. */
async function schnappschuss(c) {
  const { rows: tabellen } = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  const ergebnis = new Map();
  for (const { table_name: t } of tabellen) {
    if (AUSGENOMMEN.has(t)) continue;
    const sql = await c.query(`SELECT format('SELECT * FROM %I ORDER BY 1', $1::text) AS q`, [t]);
    const { rows } = await c.query(sql.rows[0].q);
    ergebnis.set(
      t,
      rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, wert(v)]))),
    );
  }
  return ergebnis;
}

await mitVerbindung(quelle, async (c) => {
  await c.query('DROP DATABASE IF EXISTS kirmes_upgrade');
  await c.query('CREATE DATABASE kirmes_upgrade');
});

// 1. Migrationen des Basis-Stands (wie migrate.ts: je Datei eine Transaktion + Vermerk)
const dateien = git('ls-tree', '--name-only', basis, 'db/migrations/')
  .split('\n')
  .filter((f) => f.endsWith('.sql'))
  .sort();
await mitVerbindung(ziel, async (c) => {
  await c.query(
    'CREATE TABLE schema_migration (datei text PRIMARY KEY, eingespielt_am timestamptz NOT NULL DEFAULT now())',
  );
  for (const pfad of dateien) {
    const datei = pfad.split('/').pop();
    await c.query('BEGIN');
    await c.query(git('show', `${basis}:${pfad}`));
    await c.query('INSERT INTO schema_migration (datei) VALUES ($1)', [datei]);
    await c.query('COMMIT');
  }
  // 2. Testdaten
  await c.query(
    await readFile(new URL('../db/upgrade-test/testdaten.sql', import.meta.url), 'utf8'),
  );
});
console.log(`✔ Basis ${basis.slice(0, 12)}: ${dateien.length} Migrationen + Testdaten`);

// 3. vorher
const vorher = await mitVerbindung(ziel, schnappschuss);

// 4. Update mit dem aktuellen Stand
execFileSync('npm', ['run', '-s', 'db:migrate'], {
  env: { ...process.env, DATABASE_URL: ziel.toString(), APP_DB_PASSWORD: '', ORTE_LADEN: '' },
  stdio: 'inherit',
});

// 5. nachher vergleichen
const nachher = await mitVerbindung(ziel, schnappschuss);
const fehler = [];
let zeilen = 0;
for (const [tabelle, alt] of vorher) {
  const neu = nachher.get(tabelle);
  if (!neu) {
    fehler.push(`${tabelle}: Tabelle fehlt nach dem Update`);
    continue;
  }
  if (neu.length !== alt.length) {
    fehler.push(`${tabelle}: ${alt.length} Zeilen vorher, ${neu.length} nachher`);
    continue;
  }
  alt.forEach((zeile, i) => {
    zeilen++;
    for (const [spalte, w] of Object.entries(zeile)) {
      if (!(spalte in neu[i])) fehler.push(`${tabelle}.${spalte}: Spalte fehlt nach dem Update`);
      else if (JSON.stringify(neu[i][spalte]) !== JSON.stringify(w)) {
        fehler.push(`${tabelle}.${spalte} (Zeile ${i + 1}): Wert geändert`);
      }
    }
  });
}
await mitVerbindung(quelle, (c) => c.query('DROP DATABASE IF EXISTS kirmes_upgrade'));

// Nur neue Migrationen mit ausdrücklicher Freigabe (nach Rücksprache) dürfen Daten ändern
const alt = new Set(dateien.map((p) => p.split('/').pop()));
const neueMigrationen = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(
  (f) => f.endsWith('.sql') && !alt.has(f),
);
const freigegeben = [];
for (const f of neueMigrationen) {
  const sql = await readFile(new URL(`../db/migrations/${f}`, import.meta.url), 'utf8');
  if (/--\s*datenaenderung-freigegeben:\s*#\d+/i.test(sql)) freigegeben.push(f);
}

if (fehler.length) {
  const ausgabe = freigegeben.length ? console.warn : console.error;
  ausgabe(
    freigegeben.length
      ? `⚠ Datenänderung durch freigegebene Migration(en) ${freigegeben.join(', ')}:`
      : '✖ Das Update verändert vorhandene Daten oder Zugänge (Issue #59):',
  );
  for (const f of [...new Set(fehler)]) ausgabe(`  ${f}`);
  if (!freigegeben.length) process.exit(1);
}
if (!fehler.length)
  console.log(`✔ Update lässt ${zeilen} Zeilen in ${vorher.size} Tabellen unverändert`);
