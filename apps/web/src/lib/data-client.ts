// Ohne Daten-Import – darf im Browser-Bundle landen.
export type Kategorie =
  'kirmes' | 'kinder' | 'tanz' | 'party' | 'brauchtum' | 'ostern' | 'mai' | 'fruehschoppen';

export interface Termin {
  id: string;
  datum: string | null; // ISO yyyy-mm-dd, null = Datum offen
  bestaetigt: boolean; // false = aus Vorjahr hochgerechnet
  zeit: string | null;
  ort: string;
  ortSlug: string;
  kreis: string | null;
  location: string | null;
  titel: string;
  kategorie: Kategorie;
  monatAlt: string | null;
}

export const KATEGORIEN: Record<Kategorie, { label: string; emoji: string }> = {
  kirmes: { label: 'Kirmes & Kirmestanz', emoji: '🎪' },
  kinder: { label: 'Kindertanz & Familie', emoji: '🧒' },
  tanz: { label: 'Tanz & Feste', emoji: '💃' },
  party: { label: 'Disco & Party', emoji: '🪩' },
  brauchtum: { label: 'Brauchtum', emoji: '🌳' },
  ostern: { label: 'Ostern', emoji: '🐣' },
  mai: { label: 'Tanz in den Mai', emoji: '🌸' },
  fruehschoppen: { label: 'Frühschoppen', emoji: '🍺' },
};
