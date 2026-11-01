/**
 * Plakat / Flyer im Kirmes-Assistenten (Issue #353): ein Bild für die ganze Kirmes, ein eigenes Bild
 * je Veranstaltung geht vor. Hochgeladen wird erst, wenn die Termine gespeichert sind.
 */
import { PLAKAT_MAX_BYTES } from '@kirmes/core';

export const BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp'];
const datei = (v: FormDataEntryValue | null) => (v instanceof File && v.size > 0 ? v : null);

/** Bild je Zeile (gleiche Reihenfolge wie `zeilen`) und Fehler zu falschen Dateien. */
export function lesePlakate(
  f: FormData,
  zeilen: readonly { titel: string; aktiv: boolean }[],
): { je: (File | null)[]; fehler: string[] } {
  const alle = datei(f.get('plakat'));
  const fehler: string[] = [];
  const pruefe = (d: File | null, wo: string) => {
    if (!d) return;
    if (!BILDTYPEN.includes(d.type)) fehler.push(`${wo}: bitte ein Bild als JPEG, PNG oder WebP.`);
    else if (d.size > PLAKAT_MAX_BYTES) fehler.push(`${wo}: das Bild ist größer als 8 MB.`);
  };
  pruefe(alle, 'Plakat für die ganze Kirmes');
  const je = zeilen.map((z, i) => {
    const eigenes = z.aktiv ? datei(f.get(`plakat-${i}`)) : null;
    pruefe(eigenes, `Plakat „${z.titel}“`);
    return z.aktiv ? (eigenes ?? alle) : null;
  });
  return { je, fehler };
}
