import type { APIRoute } from 'astro';
import { VORLAGE } from '../../lib/import';

const BOM = String.fromCharCode(0xfeff);

/** Vorlage für den Tabellen-Import (Issue #105) – mit BOM, damit Excel Umlaute richtig zeigt. */
export const GET: APIRoute = () =>
  new Response(`${BOM}${VORLAGE}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kirmes-import-vorlage.csv"',
      'Cache-Control': 'no-store',
    },
  });
