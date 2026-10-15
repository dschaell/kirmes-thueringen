#!/usr/bin/env node
/**
 * Lasttest für Qualitätsszenario E1: Jahres-Suche in einem Landkreis bei 10.000 Terminen.
 * Ohne Abhängigkeiten (fetch), feste Anfragefolge → vergleichbare Läufe.
 *
 *   node scripts/lasttest.mjs http://127.0.0.1:3102 [anfragen=400] [parallel=4]
 */
import { performance } from 'node:perf_hooks';

const [basis = 'http://127.0.0.1:3100', anzahl = '400', parallel = '4'] = process.argv.slice(2);
const N = Number(anzahl);
const P = Number(parallel);
const KREISE = ['GTH', 'IK', 'WAK', 'UH', 'KYF', 'SM', 'SHK', 'SOK', 'EF', 'J', 'WE', 'G'];

const szenarien = {
  'E1 Jahr + Landkreis': (i) =>
    `/api/v1/termine?von=2026-01-01&bis=2026-12-31&landkreis=${KREISE[i % KREISE.length]}&limit=200`,
  'Jahr + Freitext': (i) =>
    `/api/v1/termine?von=2026-01-01&bis=2026-12-31&q=${['belconda', 'kindertanz', 'lastgrund', 'festzelt'][i % 4]}&limit=50`,
  'Jahr ohne Filter': () => `/api/v1/termine?von=2026-01-01&bis=2026-12-31&limit=50`,
};

const perzentil = (werte, p) =>
  werte[Math.min(werte.length - 1, Math.ceil((p / 100) * werte.length) - 1)];

async function messe(name, url) {
  const zeiten = [];
  let fehler = 0;
  let naechste = 0;
  // Aufwärmen (Verbindungen, Plan-Cache) – zählt nicht
  for (let i = 0; i < 10; i++) await fetch(basis + url(i)).then((r) => r.arrayBuffer());
  const arbeiter = async () => {
    while (naechste < N) {
      const i = naechste++;
      const t = performance.now();
      const res = await fetch(basis + url(i));
      await res.arrayBuffer();
      zeiten.push(performance.now() - t);
      if (!res.ok) fehler++;
    }
  };
  const start = performance.now();
  await Promise.all(Array.from({ length: P }, arbeiter));
  const dauer = (performance.now() - start) / 1000;
  zeiten.sort((a, b) => a - b);
  const f = (ms) => `${ms.toFixed(1)} ms`;
  console.log(
    `${name.padEnd(22)} p50 ${f(perzentil(zeiten, 50))}  p95 ${f(perzentil(zeiten, 95))}  ` +
      `max ${f(zeiten.at(-1))}  ${Math.round(N / dauer)} Anfr./s  Fehler ${fehler}`,
  );
  return perzentil(zeiten, 95);
}

console.log(`Lasttest gegen ${basis}: je ${N} Anfragen, ${P} parallel\n`);
const p95 = {};
for (const [name, url] of Object.entries(szenarien)) p95[name] = await messe(name, url);
const e1 = p95['E1 Jahr + Landkreis'];
console.log(
  `\nE1: p95 ${e1.toFixed(1)} ms – Ziel < 200 ms → ${e1 < 200 ? 'erfüllt' : 'NICHT erfüllt'}`,
);
process.exit(e1 < 200 ? 0 : 1);
