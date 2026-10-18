/**
 * Kirmes ist jedes Jahr – meist am gleichen Wochenende des Monats (Issue #106).
 * Regel: gleicher n-ter Wochentag im selben Monat des Folgejahres (z. B. „3. Freitag im Oktober“).
 * Gibt es den n-ten nicht (5. Freitag), nimmt sie den letzten dieses Wochentags im Monat.
 */
const tag = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function imNaechstenJahr(datum: string): string {
  const d = new Date(utc(datum));
  const wochentag = d.getUTCDay();
  const n = Math.floor((d.getUTCDate() - 1) / 7); // 0 = erster
  const jahr = d.getUTCFullYear() + 1;
  const monat = d.getUTCMonth();
  const erster = new Date(Date.UTC(jahr, monat, 1, 12));
  const versatz = (wochentag - erster.getUTCDay() + 7) % 7;
  let ziel = 1 + versatz + n * 7;
  const tageImMonat = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  while (ziel > tageImMonat) ziel -= 7;
  return iso(Date.UTC(jahr, monat, ziel, 12));
}

/** Verschiebt ein ganzes Programm so, dass der erste Tag auf imNaechstenJahr fällt. */
export function verschiebeProgramm<T extends { datum: string }>(termine: T[]): T[] {
  if (!termine.length) return [];
  const erster = [...termine].map((t) => t.datum).sort()[0] ?? '';
  const delta = utc(imNaechstenJahr(erster)) - utc(erster);
  return termine.map((t) => ({ ...t, datum: iso(utc(t.datum) + delta) }));
}

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
/** „Oktober 2027“ – bewusst ohne Tag, weil es nur eine Erwartung ist */
export const voraussichtlich = (datum: string) => {
  const d = imNaechstenJahr(datum);
  return `${MONATE[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
};
export const tageZwischen = (von: string, bis: string) => Math.round((utc(bis) - utc(von)) / tag);
