import type { Bildwandler, Plakatbild } from '@kirmes/core';
import sharp from 'sharp';

/**
 * Plakate neu kodieren (Issue #297): Jede Datei wird dekodiert und als WebP neu geschrieben – so
 * gehen Metadaten (EXIF/GPS, Kamera) und eingeschleuste Inhalte verloren. Eine Pixelgrenze schützt
 * vor „Dekompressionsbomben“; nur echte Rasterbilder (JPEG, PNG, WebP), kein SVG/GIF.
 */
const FORMATE = new Set(['jpeg', 'png', 'webp']);
const MAX_PIXEL = 40_000_000;
const GROSS = 1600;
const KLEIN = 480;

export class SharpBildwandler implements Bildwandler {
  async wandle(datei: Uint8Array): Promise<Plakatbild | null> {
    try {
      const quelle = () => sharp(datei, { limitInputPixels: MAX_PIXEL, failOn: 'error' }).rotate();
      const meta = await sharp(datei, { limitInputPixels: MAX_PIXEL }).metadata();
      if (!meta.format || !FORMATE.has(meta.format) || (meta.pages ?? 1) > 1) return null;
      const passend = (max: number) =>
        quelle()
          .resize(max, max, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 });
      const gross = await passend(GROSS).toBuffer({ resolveWithObject: true });
      const klein = await passend(KLEIN).toBuffer();
      return {
        gross: new Uint8Array(gross.data),
        klein: new Uint8Array(klein),
        breite: gross.info.width,
        hoehe: gross.info.height,
      };
    } catch {
      return null;
    }
  }
}
