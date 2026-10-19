#!/usr/bin/env node
/**
 * Client-Skripte müssen Module sein (Issue #197): Ohne import/export behandelt TypeScript eine Datei
 * als globales Skript – gleiche Namen in zwei Skripten kollidieren dann (in #161 passiert).
 */
import { readdir, readFile } from 'node:fs/promises';

const ORDNER = new URL('../apps/web/src/scripts/', import.meta.url);
const global = [];
for (const datei of (await readdir(ORDNER)).filter((d) => d.endsWith('.ts'))) {
  const text = await readFile(new URL(datei, ORDNER), 'utf8');
  if (!/^\s*(import|export)\b/m.test(text)) global.push(datei);
}
if (global.length) {
  console.error(
    `✖ Client-Skripte ohne import/export (globale Namen): ${global.join(', ')}\n` +
      '  Bitte „export {};“ ans Ende setzen.',
  );
  process.exit(1);
}
console.log('✔ Client-Skripte sind Module');
