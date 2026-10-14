// Vergleicht zwei vitest json-summary-Dateien: Abdeckung darf nicht sinken (Toleranz 0,1 %-Punkte).
// Aufruf: node scripts/coverage-ratchet.mjs basis.json pr.json
import { readFileSync } from 'node:fs';

const [basis, pr] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')).total);
const TOLERANZ = 0.1;
let gesunken = false;
for (const metrik of ['lines', 'statements', 'functions', 'branches']) {
  const vorher = basis[metrik].pct;
  const nachher = pr[metrik].pct;
  const ok = nachher + TOLERANZ >= vorher;
  gesunken ||= !ok;
  console.log(
    `${ok ? '✔' : '✖'} ${metrik.padEnd(10)} ${vorher.toFixed(2)} % → ${nachher.toFixed(2)} %`,
  );
}
if (gesunken) {
  console.error('\nTestabdeckung ist gegenüber dem Basis-Branch gesunken.');
  process.exit(1);
}
