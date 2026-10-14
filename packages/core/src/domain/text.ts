/**
 * Normalisierung von Freitext aus Meldungen und dem Altdaten-Import.
 * Ziel: einheitliche, saubere Titel – keine Platzhalter, deutsche Anführungszeichen.
 */

/** Bekannte Tippfehler aus dem Altbestand (vollständige Wörter). */
const TIPPFEHLER: Record<string, string> = {
  Kinderkermse: 'Kinderkirmes',
  Kirmetanz: 'Kirmestanz',
  Kirmesbeerdigun: 'Kirmesbeerdigung',
  Kirmse: 'Kirmes',
  Kermestanz: 'Kirmestanz',
};

/**
 * „Kirmestanz mit "..."“ → „Kirmestanz“: Platzhalter für noch unbekannte Bands entfernen,
 * samt einleitendem „mit (der Band|den|dem)“.
 */
const PLATZHALTER =
  /\s*(?:mit\s+(?:der\s+Band\s+|den\s+|dem\s+|DJ\s+)?)?["„“”']?\s*(?:\.{2,}|…)\s*["„“”']?(?=\s*$|\s*[,;])/giu;

export function bereinigeTitel(roh: string): string {
  let t = roh.normalize('NFC').replace(/\s+/g, ' ').trim();

  t = t.replace(/["„“”]\s*\?+\s*["„“”]/g, ''); // „???“
  t = t.replace(/\s*\?{2,}[\s!.?]*/g, ' '); // ????, ?? !!!
  t = t.replace(/["„“”]\s*\.{2,}[^"„“”]{0,3}["„“”]/g, ''); // „...n“
  t = t.replace(PLATZHALTER, '');
  t = t.replace(/\s*\.{2,}\s*/g, ' ').trim();
  t = t.replace(/\s+mit(?:\s+(?:der|den|dem))?(?:\s+(?:Band|DJ))?$/i, '').trim(); // „Kirmestanz mit“ ohne Band
  t = t.replace(/\bvon den mit\b/g, 'mit den');

  for (const [falsch, richtig] of Object.entries(TIPPFEHLER)) {
    t = t.replace(new RegExp(`\\b${falsch}\\b`, 'g'), richtig);
  }

  // Gerade und gemischte Anführungszeichen → „…“; ein offenes Zeichen am Ende wird geschlossen.
  const teile = t.split(/["“”„]/);
  if (teile.length > 1) {
    if (teile.length % 2 === 0) teile.push('');
    t = teile.map((s, i) => (i === 0 ? s : (i % 2 ? '„' : '“') + s)).join('');
  }

  return t
    .replace(/„\s+/g, '„')
    .replace(/\s+“/g, '“')
    .replace(/[\s,;:–-]+$/, '')
    .trim();
}

/** „keine Kirmes seit …“ u. ä. sind Hinweise im Altbestand, keine Veranstaltungen. */
export const istKeinTermin = (titel: string): boolean => /^keine\s+kirmes/i.test(titel.trim());

/** Abkürzungen von Ortsteilen ausschreiben: „EF-Stotternheim“ → „Erfurt-Stotternheim“. */
export function normalisiereOrtsname(roh: string): string {
  return roh
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^EF-/, 'Erfurt-')
    .replace(/\s*\/\s*/g, ' / ');
}
