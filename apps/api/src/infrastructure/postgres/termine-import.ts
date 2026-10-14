/**
 * CLI: importiert die Recherche-Tabelle der Redaktion (CSV aus Google Sheets oder Excel).
 *
 *   npm run termine:import -- recherche.csv          → einspielen
 *   npm run termine:import -- recherche.csv --probe  → nur prüfen, nichts speichern
 *
 * Jede Zeile läuft durch die Fachregeln des Core. Fehlerhafte Zeilen werden mit Zeilennummer
 * gemeldet und übersprungen; vorhandene Termine (gleicher Ort, Datum, Titel) werden aktualisiert.
 */
import { leseRecherche, normalisiereOrtsname, parseCsv, validiereTermin } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import { ladeKonfiguration } from '../../config.js';
import { erstellePool } from './pool.js';

const [pfad, ...optionen] = process.argv.slice(2);
if (!pfad) {
  console.error('Aufruf: npm run termine:import -- <datei.csv> [--probe]');
  process.exit(1);
}
const probe = optionen.includes('--probe');

const gelesen = leseRecherche(parseCsv(await readFile(pfad, 'utf8')));
if (!gelesen.ok) {
  for (const f of gelesen.error) console.error(`✖ ${f.meldung}`);
  process.exit(1);
}

const k = ladeKonfiguration();
const pool = erstellePool({
  connectionString: k.databaseUrl,
  ssl: k.dbSsl,
  maxVerbindungen: 1,
  statementTimeoutMs: 60_000,
});

/** Ortsauflösung: Slug, sonst Name (ohne Groß-/Kleinschreibung), „Erfurt-Stotternheim“ → „Stotternheim“. */
const { rows: orte } = await pool.query<{
  id: string;
  slug: string;
  name: string;
  landkreis: string;
}>('SELECT id, slug, name, landkreis FROM ort');
const schluessel = (s: string) => normalisiereOrtsname(s).toLowerCase();
const nachName = new Map<string, typeof orte>();
for (const o of orte)
  nachName.set(schluessel(o.name), [...(nachName.get(schluessel(o.name)) ?? []), o]);
const nachSlug = new Map(orte.map((o) => [o.slug, o]));

function findeOrt(eingabe: string, landkreis: string | null) {
  const direkt = nachSlug.get(eingabe.trim().toLowerCase());
  if (direkt) return { ort: direkt };
  const kandidaten =
    nachName.get(schluessel(eingabe)) ??
    nachName.get(schluessel(eingabe.replace(/^[^-]+-/, ''))) ??
    [];
  const passend = landkreis ? kandidaten.filter((o) => o.landkreis === landkreis) : kandidaten;
  const [einziger] = passend;
  if (passend.length === 1 && einziger) return { ort: einziger };
  if (passend.length === 0)
    return { fehler: `Ort „${eingabe}“${landkreis ? ` (${landkreis})` : ''} nicht gefunden` };
  return {
    fehler: `„${eingabe}“ ist mehrdeutig: ${passend.map((o) => `${o.slug} (${o.landkreis})`).join(', ')} – Landkreis oder Slug angeben`,
  };
}

const fehler: string[] = [];
let neu = 0;
let aktualisiert = 0;
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const { zeile, daten: z } of gelesen.value) {
    const o = findeOrt(z.ort, z.landkreis);
    if ('fehler' in o) {
      fehler.push(`Zeile ${zeile}: ${o.fehler}`);
      continue;
    }
    const v = validiereTermin({
      ortSlug: o.ort.slug,
      landkreis: o.ort.landkreis,
      datum: z.datum,
      beginn: z.beginn,
      titel: z.titel,
      veranstaltungsort: z.veranstaltungsort,
      kategorie: z.kategorie,
      bestaetigt: z.bestaetigt,
      band: z.band,
      info: z.info,
    });
    if (!v.ok) {
      fehler.push(`Zeile ${zeile}: ${v.error.map((f) => f.meldung).join(' ')}`);
      continue;
    }
    const t = v.value.termin;
    const r = await client.query<{ neu: boolean }>(
      `INSERT INTO termin (ort_id, datum, beginn, titel, veranstaltungsort, kategorie, bestaetigt, quelle, band, info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (ort_id, datum, titel) DO UPDATE SET
         beginn = EXCLUDED.beginn, veranstaltungsort = EXCLUDED.veranstaltungsort,
         kategorie = EXCLUDED.kategorie, bestaetigt = termin.bestaetigt OR EXCLUDED.bestaetigt,
         quelle = COALESCE(EXCLUDED.quelle, termin.quelle),
         band = COALESCE(EXCLUDED.band, termin.band), info = COALESCE(EXCLUDED.info, termin.info),
         geaendert_am = now()
       RETURNING (xmax = 0) AS neu`,
      [
        o.ort.id,
        t.datum,
        t.beginn,
        t.titel,
        t.veranstaltungsort,
        t.kategorie,
        t.bestaetigt,
        z.quelle,
        t.band,
        t.info,
      ],
    );
    if (r.rows[0]?.neu) neu++;
    else aktualisiert++;
  }
  await client.query(probe ? 'ROLLBACK' : 'COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}

for (const f of fehler) console.warn(`✖ ${f}`);
console.log(
  `${probe ? 'Probelauf – nichts gespeichert. ' : ''}✔ ${neu} neu, ${aktualisiert} aktualisiert, ${fehler.length} Zeilen mit Fehlern`,
);
if (fehler.length) process.exitCode = 2;
