/** Eigenes Konto: Sicherungsstand, ich, Passkeys, Abmelden – aus admin-routen.ts ausgelagert (Issue #199), Verhalten unverändert. */
import { darf } from '@kirmes/core';
import { problem, sitzungsToken, ungueltig, nichtGefunden, ID, objekt, TEXT } from './gemeinsam.js';
import type { FastifyInstance } from 'fastify';
import type { AdminAbhaengigkeiten } from './gemeinsam.js';
import type { Kontext } from './kontext.js';

export async function kontoRouten(r: FastifyInstance, d: AdminAbhaengigkeiten, k: Kontext) {
  const { ANTWORT, admin, akteur } = k;
  const passkeys = d.passkeys;
  // Stand der Sicherungen – nur Admins (Issue #45)
  if (d.sicherungen) {
    const sicherungen = d.sicherungen;
    r.get('/api/v1/admin/sicherungen', async (req, reply) =>
      darf(akteur(req), 'sicherungen')
        ? sicherungen()
        : reply.status(403).send(problem(403, 'Nur für Admins.')),
    );
  }

  r.get('/api/v1/admin/ich', async (req) => ({
    adminId: admin(req),
    name: akteur(req).name,
    rolle: akteur(req).rolle,
    ortSlug: akteur(req).ortSlug ?? null,
    ortName: akteur(req).ortName ?? null,
    passkeys: !!passkeys,
  }));

  // Passkeys des angemeldeten Mitglieds
  if (passkeys) {
    r.get('/api/v1/admin/passkeys', (req) => passkeys.liste(admin(req)));
    r.post('/api/v1/admin/passkeys/optionen', async (req, reply) => {
      const o = await passkeys.starteEinrichtung(admin(req));
      return o ?? nichtGefunden(reply);
    });
    r.post<{ Body: { vorgang: string; antwort: unknown; name?: string } }>(
      '/api/v1/admin/passkeys',
      {
        bodyLimit: 64 * 1024,
        schema: {
          body: objekt(['vorgang', 'antwort'], {
            vorgang: TEXT(64),
            antwort: ANTWORT,
            name: TEXT(200),
          }),
        },
      },
      async (req, reply) => {
        const p = await passkeys.beendeEinrichtung(
          admin(req),
          req.body.vorgang,
          req.body.antwort,
          req.body.name ?? '',
        );
        return p.ok ? reply.status(201).send(p.value) : ungueltig(reply, p.error);
      },
    );
    r.delete<{ Params: { id: string } }>(
      '/api/v1/admin/passkeys/:id',
      { schema: { params: ID } },
      async (req, reply) => {
        const l = await passkeys.loesche(admin(req), req.params.id);
        if (l.ok) return reply.status(204).send();
        return l.error === 'LETZTER'
          ? reply
              .status(409)
              .send(
                problem(
                  409,
                  'Der letzte Passkey bleibt – sonst kannst du dich nicht mehr anmelden.',
                ),
              )
          : nichtGefunden(reply);
      },
    );
  }

  r.post('/api/v1/admin/abmelden', async (req, reply) => {
    await d.anmeldung.abmelden(sitzungsToken(req.headers.authorization));
    return reply.status(204).send();
  });
}
