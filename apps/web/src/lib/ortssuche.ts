/**
 * Ortssuche für „Termin melden“ und „Kirmes eintragen“ (Issue #89): statt 3.000 Orte als
 * datalist mitzuschicken, sucht ein kleiner Endpunkt die passenden – Groß-/Kleinschreibung,
 * Umlaute und Bindestriche egal. Der Server erkennt den Ort beim Absenden mit derselben Logik.
 */
export interface OrtKurz {
  slug: string;
  name: string;
  landkreis: string;
}
export interface OrtTreffer {
  /** Text fürs Eingabefeld, z. B. „Alkersleben (IK)“ */
  wert: string;
  slug: string;
}

export const normalisiere = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Anzeigename; Namensvettern im selben Kreis bekommen den Slug dazu. */
export function bezeichner(orte: OrtKurz[]): (o: OrtKurz) => string {
  const anzahl = new Map<string, number>();
  for (const o of orte) {
    const k = `${o.name}|${o.landkreis}`;
    anzahl.set(k, (anzahl.get(k) ?? 0) + 1);
  }
  return (o) =>
    `${o.name} (${o.landkreis})${(anzahl.get(`${o.name}|${o.landkreis}`) ?? 0) > 1 ? ` · ${o.slug}` : ''}`;
}

/** Bis zu `max` Treffer: erst Namensanfang, dann Wortanfang, dann irgendwo im Namen. */
export function sucheOrte(orte: OrtKurz[], q: string, max = 8): OrtTreffer[] {
  const n = normalisiere(q.replace(/\s*\([^)]*\).*$/, ''));
  if (n.length < 2) return [];
  const name = bezeichner(orte);
  const rang = (o: OrtKurz) => {
    const t = normalisiere(o.name);
    if (t === n) return 0;
    if (t.startsWith(n)) return 1;
    if (t.split(' ').some((w) => w.startsWith(n))) return 2;
    return t.includes(n) ? 3 : -1;
  };
  return orte
    .map((o) => ({ o, r: rang(o) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || name(a.o).localeCompare(name(b.o), 'de'))
    .slice(0, max)
    .map(({ o }) => ({ wert: name(o), slug: o.slug }));
}

/** Ort aus der Eingabe – eindeutig oder gar nicht. */
export function findeOrtEindeutig(orte: OrtKurz[], text: string): OrtKurz | null {
  const name = bezeichner(orte);
  const exakt = orte.filter((o) => o.slug === text || name(o) === text || o.name === text);
  // „muehlberg“ ist zugleich Slug eines Ortes und Name dreier Orte – dann nicht raten (Issue #121)
  const namensvettern = orte.filter((o) => normalisiere(o.name) === normalisiere(text)).length;
  if (exakt.length === 1 && exakt[0]?.slug === text && name(exakt[0]) !== text && namensvettern > 1)
    return null;
  if (exakt.length === 1) return exakt[0] ?? null;
  if (exakt.length > 1) return null;
  // Tolerant: „alkersleben“, „Muehlberg“, „Alkersleben (ik)“ – aber nur, wenn eindeutig
  const kreis = /\(([^)]+)\)/.exec(text)?.[1]?.trim().toUpperCase();
  const gleich = orte.filter(
    (o) =>
      normalisiere(o.name) === normalisiere(text.replace(/\s*\([^)]*\).*$/, '')) &&
      (!kreis || o.landkreis.toUpperCase() === kreis),
  );
  return gleich.length === 1 ? (gleich[0] ?? null) : null;
}
