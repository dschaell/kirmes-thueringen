import type { APIRoute } from 'astro';
import { termine } from '../lib/data';

// Kompakte Daten für die Suche im Browser
export const GET: APIRoute = () =>
  new Response(JSON.stringify(termine.map(({ monatAlt, id, ...t }) => t)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
