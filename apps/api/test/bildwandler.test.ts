import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SharpBildwandler } from '../src/infrastructure/bildwandler.js';

const w = new SharpBildwandler();
const bild = (breite: number, hoehe: number) =>
  sharp({ create: { width: breite, height: hoehe, channels: 3, background: '#a4161a' } });

describe('Plakate neu kodieren (Issue #297)', () => {
  it('JPEG mit Metadaten → WebP in zwei Größen, ohne EXIF, nie vergrößert', async () => {
    const jpeg = await bild(2400, 3394)
      .withMetadata({ exif: { IFD0: { Copyright: 'Testkamera' } } })
      .jpeg()
      .toBuffer();
    const r = await w.wandle(new Uint8Array(jpeg));
    expect(r).toMatchObject({ breite: 1131, hoehe: 1600 });
    const gross = await sharp(r!.gross).metadata();
    const klein = await sharp(r!.klein).metadata();
    expect([gross.format, gross.exif, klein.width, klein.height]).toEqual([
      'webp',
      undefined,
      340,
      480,
    ]);
    const kleines = await w.wandle(new Uint8Array(await bild(300, 200).png().toBuffer()));
    expect(kleines).toMatchObject({ breite: 300, hoehe: 200 });
  });
  it('kein Bild, SVG und GIF werden abgelehnt', async () => {
    expect(await w.wandle(new TextEncoder().encode('kein Bild'))).toBeNull();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    expect(await w.wandle(new TextEncoder().encode(svg))).toBeNull();
    expect(await w.wandle(new Uint8Array(await bild(10, 10).gif().toBuffer()))).toBeNull();
  });
});
