/**
 * Kalender-Abo für ganz Thüringen, einen Landkreis oder einen Ort (Issue #108).
 * Nur gültige Kürzel bzw. Slugs – alles andere ist „nicht gefunden“ statt still alles zu liefern.
 */
import { LANDKREISE, type LandkreisKuerzel } from '@kirmes/core';
import { imKreis } from './anzeige';
import { findeOrt } from './api';

export interface AboAuswahl {
  /** Parameter für die API-Suche */
  filter: { landkreis?: string[]; ort?: string };
  /** Name des Kalenders, z. B. „Kirmes im Ilm-Kreis“ */
  name: string;
  /** Query für die Abo-Adresse, z. B. „?kreis=IK“ */
  query: string;
}

export async function aboAuswahl(p: URLSearchParams): Promise<AboAuswahl | null> {
  const kreisRoh = (p.get('kreis') ?? '').toUpperCase();
  const ortRoh = p.get('ort') ?? '';
  if (ortRoh) {
    if (!/^[a-z0-9-]{1,120}$/.test(ortRoh)) return null;
    const ort = await findeOrt(ortRoh);
    return ort
      ? { filter: { ort: ort.slug }, name: `Kirmes in ${ort.name}`, query: `?ort=${ort.slug}` }
      : null;
  }
  if (kreisRoh) {
    if (!(kreisRoh in LANDKREISE)) return null;
    const k = kreisRoh as LandkreisKuerzel;
    return {
      filter: { landkreis: [k] },
      name: `Kirmes ${imKreis(k)}`,
      query: `?kreis=${encodeURIComponent(k)}`,
    };
  }
  return { filter: {}, name: 'Kirmeskalender Thüringen', query: '' };
}
