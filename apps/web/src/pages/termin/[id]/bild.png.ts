import type { APIRoute } from 'astro';
import { findeTermin } from '../../../lib/api';
import { datumLangJahr, artName } from '../../../lib/anzeige';
import { vorschauPng } from '../../../lib/vorschaubild';

/** Kleiner Speicher: Bild je Termin-Inhalt (Titel/Datum/Ort ändern → neuer Schlüssel). */
const speicher = new Map<string, ArrayBuffer>();

export const GET: APIRoute = async ({ params }) => {
  const t = await findeTermin(params.id ?? '');
  if (!t) return new Response(null, { status: 404 });
  const daten = {
    titel: t.titel,
    wann: `${datumLangJahr(t.datum)}${t.beginn ? ` · ${t.beginn} Uhr` : ''}`,
    // „Kirche Alkersleben · Alkersleben“ vermeiden: Ort nur, wenn er nicht schon drinsteht
    wo:
      t.veranstaltungsort && t.veranstaltungsort.includes(t.ort.name)
        ? t.veranstaltungsort
        : [t.veranstaltungsort, t.ort.name].filter(Boolean).join(' · '),
    art: artName(t.kategorie),
  };
  const schluessel = JSON.stringify(daten);
  let png = speicher.get(schluessel);
  if (!png) {
    png = vorschauPng(daten);
    if (speicher.size > 500) speicher.clear();
    speicher.set(schluessel, png);
  }
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
};
