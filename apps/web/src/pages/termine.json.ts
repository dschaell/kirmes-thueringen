import type { APIRoute } from 'astro';
import { termine } from '../lib/data';

// Kompakte Daten für die Suche im Browser
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      termine.map(
        ({ datum, bestaetigt, zeit, ort, ortSlug, kreis, location, titel, kategorie }) => ({
          datum,
          bestaetigt,
          zeit,
          ort,
          ortSlug,
          kreis,
          location,
          titel,
          kategorie,
        }),
      ),
    ),
    {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
