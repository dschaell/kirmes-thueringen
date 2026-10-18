import { describe, expect, it } from 'vitest';
import { findeOrtEindeutig, normalisiere, sucheOrte } from '../src/lib/ortssuche';

const orte = [
  { slug: 'alkersleben', name: 'Alkersleben', landkreis: 'IK' },
  { slug: 'muehlberg', name: 'Mühlberg', landkreis: 'IK' },
  { slug: 'muehlberg-gth', name: 'Mühlberg', landkreis: 'GTH' },
  { slug: 'bad-berka', name: 'Bad Berka', landkreis: 'WE' },
  { slug: 'berka-vor-dem-hainich', name: 'Berka vor dem Hainich', landkreis: 'WAK' },
  { slug: 'neudorf-a', name: 'Neudorf', landkreis: 'SHK' },
  { slug: 'neudorf-b', name: 'Neudorf', landkreis: 'SHK' },
];

describe('Ortssuche (Issue #89)', () => {
  it('normalisiert Umlaute, Groß-/Kleinschreibung und Zeichen', () => {
    expect(normalisiere('  Mühl-Berg ')).toBe('muehl berg');
    expect(normalisiere('Straßburg')).toBe('strassburg');
  });

  it('findet Namensanfang vor Wortanfang vor Teilstring, höchstens max', () => {
    expect(sucheOrte(orte, 'berka').map((t) => t.slug)).toEqual([
      'berka-vor-dem-hainich',
      'bad-berka',
    ]);
    expect(sucheOrte(orte, 'muehl').map((t) => t.wert)).toEqual([
      'Mühlberg (GTH)',
      'Mühlberg (IK)',
    ]);
    expect(sucheOrte(orte, 'e', 8)).toEqual([]);
    expect(sucheOrte(orte, 'er', 2)).toHaveLength(2);
    expect(sucheOrte(orte, 'Alkersleben (IK)')[0]?.slug).toBe('alkersleben');
  });

  it('unterscheidet Namensvettern im selben Kreis per Slug', () => {
    expect(sucheOrte(orte, 'neudorf').map((t) => t.wert)).toEqual([
      'Neudorf (SHK) · neudorf-a',
      'Neudorf (SHK) · neudorf-b',
    ]);
  });

  it('erkennt den Ort beim Absenden eindeutig und tolerant', () => {
    expect(findeOrtEindeutig(orte, 'Alkersleben (IK)')?.slug).toBe('alkersleben');
    expect(findeOrtEindeutig(orte, 'alkersleben')?.slug).toBe('alkersleben');
    expect(findeOrtEindeutig(orte, 'ALKERSLEBEN (ik)')?.slug).toBe('alkersleben');
    expect(findeOrtEindeutig(orte, 'Muehlberg (GTH)')?.slug).toBe('muehlberg-gth');
    expect(findeOrtEindeutig(orte, 'Neudorf (SHK) · neudorf-b')?.slug).toBe('neudorf-b');
    // Slug, der zugleich mehrdeutiger Name ist, wird nicht geraten (Issue #121)
    expect(findeOrtEindeutig(orte, 'muehlberg')).toBeNull();
    expect(findeOrtEindeutig(orte, 'muehlberg-gth')?.slug).toBe('muehlberg-gth');
    expect(findeOrtEindeutig(orte, 'alkersleben')?.slug).toBe('alkersleben');
    // mehrdeutig oder unbekannt → nichts raten
    expect(findeOrtEindeutig(orte, 'Mühlberg')).toBeNull();
    expect(findeOrtEindeutig(orte, 'Neudorf (SHK)')).toBeNull();
    expect(findeOrtEindeutig(orte, 'Atlantis')).toBeNull();
    expect(findeOrtEindeutig(orte, '')).toBeNull();
  });
});
