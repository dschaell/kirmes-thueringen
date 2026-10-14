// Bricht ab, sobald ein ZAP-Report Alerts mit Risiko Medium (2) oder High (3) enthält.
// Aufruf: node scripts/zap-gate.mjs zap/web.json zap/api.json
import { readFileSync } from 'node:fs';

const RISIKO = ['Informational', 'Low', 'Medium', 'High'];
let blocker = 0;
for (const datei of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(datei, 'utf8'));
  for (const site of report.site ?? []) {
    for (const a of site.alerts ?? []) {
      const risiko = Number(a.riskcode);
      const zeile = `${datei}: [${RISIKO[risiko]}] ${a.name} (Plugin ${a.pluginid}, ${a.count} Fundstellen)`;
      if (risiko >= 2) {
        blocker++;
        console.error(`✖ ${zeile}`);
      } else {
        console.log(`· ${zeile}`);
      }
    }
  }
}
if (blocker) {
  console.error(`\n${blocker} Alert(s) ab Medium – Gate fehlgeschlagen.`);
  process.exit(1);
}
console.log('\n✔ Keine Alerts ab Medium.');
