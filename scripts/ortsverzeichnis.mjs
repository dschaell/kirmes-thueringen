// Erzeugt db/seed/orte.json: alle Orte und Ortsteile Thüringens aus OpenStreetMap
// (Stadt, Kleinstadt, Dorf, Weiler, Stadtteil) mit Landkreis und Koordinaten.
//
//   node scripts/ortsverzeichnis.mjs
//
// Daten © OpenStreetMap-Mitwirkende, Lizenz ODbL 1.0 – siehe db/seed/ORTE-LIZENZ.md.
import { writeFileSync } from 'node:fs';

/** Amtlicher Kreisschlüssel (Thüringen = 16) → Kfz-Kennzeichen, wie im Core (LANDKREISE). */
const KREIS = {
  16051: 'EF',
  16052: 'G',
  16053: 'J',
  16054: 'SHL',
  16055: 'WE',
  16056: 'EA',
  16061: 'EIC',
  16062: 'NDH',
  16063: 'WAK',
  16064: 'UH',
  16065: 'KYF',
  16066: 'SM',
  16067: 'GTH',
  16068: 'SÖM',
  16069: 'HBN',
  16070: 'IK',
  16071: 'WL',
  16072: 'SON',
  16073: 'SLF',
  16074: 'SHK',
  16075: 'SOK',
  16076: 'GRZ',
  16077: 'ABG',
};

const ABFRAGE = `
[out:json][timeout:300];
area["ISO3166-2"="DE-TH"]["admin_level"="4"]->.th;
rel(area.th)["boundary"="administrative"]["admin_level"="6"];
map_to_area->.kreise;
foreach.kreise->.k(
  .k out tags;
  node(area.k)["place"~"^(city|town|village|hamlet|suburb)$"]["name"];
  out;
);`;

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Öffentliche Overpass-Server – bei Überlastung wird der nächste versucht. */
const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function abfragen() {
  for (let versuch = 0; versuch < 2; versuch++) {
    for (const url of SERVER) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent':
              'kirmeskalender-thueringen/0.1 (Ortsverzeichnis; github.com/dschaell/kirmes-thueringen)',
          },
          body: new URLSearchParams({ data: ABFRAGE }),
          signal: AbortSignal.timeout(330_000),
        });
        if (res.ok) return await res.json();
        console.warn(`${url}: HTTP ${res.status}`);
      } catch (e) {
        console.warn(`${url}: ${e.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error('Kein Overpass-Server erreichbar – bitte später erneut versuchen.');
}

const { elements } = await abfragen();

const orte = [];
let kreis = null;
const unbekannt = new Set();
for (const e of elements) {
  if (e.type === 'area') {
    const schluessel = (
      e.tags['de:amtlicher_gemeindeschluessel'] ??
      e.tags['de:regionalschluessel'] ??
      ''
    ).slice(0, 5);
    kreis = KREIS[schluessel] ?? null;
    if (!kreis) unbekannt.add(`${e.tags.name} (${schluessel || '?'})`);
    continue;
  }
  if (!kreis) continue;
  orte.push({
    name: e.tags.name.trim(),
    landkreis: kreis,
    art: e.tags.place,
    lat: Math.round(e.lat * 1e6) / 1e6,
    lon: Math.round(e.lon * 1e6) / 1e6,
    osm: e.id,
  });
}

// Eindeutige Slugs: Bei gleichen Namen bekommt der bedeutendste Ort (Stadt > Dorf > Weiler) die kurze
// Adresse, sofern er eindeutig ist; alle anderen werden um das Kreiskennzeichen ergänzt.
const RANG = { city: 0, town: 1, village: 2, suburb: 3, hamlet: 4 };
const nachName = new Map();
for (const o of orte) nachName.set(slug(o.name), [...(nachName.get(slug(o.name)) ?? []), o]);
const vergeben = new Set();
for (const [basis, gruppe] of nachName) {
  gruppe.sort((a, b) => RANG[a.art] - RANG[b.art]);
  const kurz = gruppe.length === 1 || RANG[gruppe[0].art] < RANG[gruppe[1].art] ? gruppe[0] : null;
  for (const o of gruppe) {
    let s = o === kurz ? basis : `${basis}-${slug(o.landkreis)}`;
    for (let n = 2; vergeben.has(s); n++) s = `${basis}-${slug(o.landkreis)}-${n}`;
    vergeben.add(s);
    o.slug = s;
  }
}
orte.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.landkreis.localeCompare(b.landkreis));

const ziel = new URL('../db/seed/orte.json', import.meta.url);
writeFileSync(ziel, JSON.stringify(orte, null, 1) + '\n');
const jeKreis = Object.fromEntries(
  Object.values(KREIS).map((k) => [k, orte.filter((o) => o.landkreis === k).length]),
);
console.log(`✔ ${orte.length} Orte → db/seed/orte.json`);
console.log('je Kreis:', jeKreis);
if (unbekannt.size) console.log('nicht zugeordnete Gebiete:', [...unbekannt]);
