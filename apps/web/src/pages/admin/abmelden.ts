import type { APIRoute } from 'astro';
import { adminApi, loescheSitzung } from '../../lib/admin';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await adminApi(cookies, 'POST', 'abmelden');
  loescheSitzung(cookies);
  return redirect('/', 303);
};
