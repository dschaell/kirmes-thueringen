import type { APIRoute } from 'astro';
import { pushAnApi } from '../../lib/api';

/** Öffentlicher VAPID-Schlüssel (Issue #348); 404 = Push noch nicht eingerichtet */
export const GET: APIRoute = () => pushAnApi('GET', 'schluessel');
