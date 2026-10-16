#!/usr/bin/env node
/**
 * Sperre für datenverändernde Migrationen (Issue #59): Updates dürfen Zugänge und Daten der Nutzer
 * nie ändern oder löschen. Neue Migrationen (Nummer > BASIS) dürfen deshalb nur ergänzen.
 *
 * Verboten (außer mit Freigabe-Kommentar `-- datenaenderung-freigegeben: #<issue>`):
 *   DROP TABLE/COLUMN/SCHEMA/TYPE/VIEW, DELETE, TRUNCATE, UPDATE, RENAME, ALTER COLUMN … TYPE,
 *   ALTER COLUMN … SET NOT NULL (scheitert bei vorhandenen NULL-Werten), DROP DEFAULT reicht nicht
 *   zum Löschen von Daten und bleibt erlaubt.
 *
 *   node scripts/migrationen-pruefen.mjs [verzeichnis]
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Migrationen bis einschließlich dieser Nummer sind ausgespielt und bleiben unangetastet. */
export const BASIS = 10;
const FREIGABE = /--\s*datenaenderung-freigegeben:\s*#\d+/i;

const REGELN = [
  [
    /\bDROP\s+(TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE)\b/i,
    'DROP löscht Objekte samt Daten',
  ],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN löscht Daten'],
  [/\bDELETE\s+FROM\b/i, 'DELETE löscht Zeilen'],
  [/\bTRUNCATE\b/i, 'TRUNCATE löscht alle Zeilen'],
  [/\bUPDATE\s+[\w."]+\s+SET\b/i, 'UPDATE ändert vorhandene Daten'],
  [/\bRENAME\b/i, 'RENAME bricht laufenden Code und Daten-Zugriffe'],
  [/\bALTER\s+COLUMN\s+[\w"]+\s+(SET\s+DATA\s+)?TYPE\b/i, 'Typänderung kann Daten verändern'],
  [
    /\bALTER\s+COLUMN\s+[\w"]+\s+SET\s+NOT\s+NULL\b/i,
    'SET NOT NULL scheitert/verlangt Datenänderung',
  ],
];

/** Kommentare und Zeichenketten entfernen, damit nur echter SQL-Code geprüft wird. */
function nurCode(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ');
}

/** @returns Liste der Verstöße (leer = in Ordnung) */
export function pruefeMigration(datei, sql) {
  const nummer = Number(/^(\d+)_/.exec(datei)?.[1] ?? NaN);
  if (!Number.isFinite(nummer)) return [`${datei}: Dateiname muss mit einer Nummer beginnen`];
  if (nummer <= BASIS || FREIGABE.test(sql)) return [];
  const code = nurCode(sql);
  return REGELN.filter(([muster]) => muster.test(code)).map(([, grund]) => `${datei}: ${grund}`);
}

async function main() {
  const verzeichnis =
    process.argv[2] ?? fileURLToPath(new URL('../db/migrations/', import.meta.url));
  const dateien = (await readdir(verzeichnis)).filter((f) => f.endsWith('.sql')).sort();
  const fehler = [];
  const texte = new Map();
  for (const d of dateien) {
    texte.set(d, await readFile(`${verzeichnis}/${d}`, 'utf8'));
    fehler.push(...pruefeMigration(d, texte.get(d)));
  }
  if (fehler.length) {
    console.error('✖ Migrationen ändern oder löschen Daten (Issue #59):');
    for (const f of fehler) console.error(`  ${f}`);
    console.error(
      '  Nur ergänzen – oder nach Rücksprache mit Freigabe-Kommentar „-- datenaenderung-freigegeben: #<issue>“.',
    );
    process.exit(1);
  }
  const freigegeben = dateien.filter(
    (d) => Number(/^(\d+)_/.exec(d)?.[1]) > BASIS && FREIGABE.test(texte.get(d) ?? ''),
  );
  console.log(
    `✔ ${dateien.length} Migrationen geprüft` +
      (freigegeben.length
        ? ` – freigegebene Datenänderung: ${freigegeben.join(', ')}`
        : ' – keine Datenänderung'),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
