/** Gemeinsame Helfer der Redaktions-API (Issue #199). */
import type { Sitzung } from '@kirmes/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { problem, nichtGefunden, objekt, TEXT } from './gemeinsam.js';

export function kontext() {
  const ANTWORT = { type: 'object', maxProperties: 10 } as const;
  const TOKEN = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } as const;
  const REGISTRIERUNG = objekt(['vorgang', 'antwort'], { vorgang: TEXT(64), antwort: ANTWORT });
  const keinCache = (reply: FastifyReply) => reply.header('Cache-Control', 'no-store');

  /** Fehler beim Anlegen eines Kontos (Ersteinrichtung oder Einladung) */
  const registrierungsFehler = (reply: FastifyReply, fehler: string) =>
    fehler === 'UNGUELTIG'
      ? reply.status(400).send(problem(400, 'Der Passkey konnte nicht bestätigt werden.'))
      : fehler === 'VERGEBEN' || fehler === 'SCHON_EINGERICHTET'
        ? reply.status(409).send(problem(409, 'Der Zugang ist bereits eingerichtet.'))
        : fehler === 'ZU_VIELE'
          ? reply
              .status(429)
              .header('Retry-After', '3600')
              .send(
                problem(
                  429,
                  'Es wurden schon mehrere Links verschickt – bitte ins Postfach schauen.',
                ),
              )
          : reply
              .status(404)
              .send(problem(404, 'Der Link ist abgelaufen oder wurde schon benutzt.'));
  const admin = (req: FastifyRequest) => req.sitzung?.adminId ?? '';
  const akteur = (req: FastifyRequest) => req.sitzung as Sitzung;
  const verwaltungsFehler = (reply: FastifyReply, fehler: string) =>
    fehler === 'BEZEICHNUNG'
      ? reply.status(400).send(problem(400, 'Bezeichnung: höchstens 120 Zeichen.'))
      : fehler === 'ORT_FEHLT'
        ? reply
            .status(400)
            .send(
              problem(400, 'Bitte den Ort der Kirmesgesellschaft aus dem Ortsverzeichnis wählen.'),
            )
        : fehler === 'ROLLE'
          ? reply
              .status(400)
              .send(problem(400, 'Kirmesgesellschaft wird man nur per Einladung mit Ort.'))
          : fehler === 'NUR_ADMIN'
            ? reply.status(403).send(problem(403, 'Nur für Admins.'))
            : fehler === 'LETZTER_ADMIN'
              ? reply
                  .status(409)
                  .send(
                    problem(
                      409,
                      'Mindestens ein Admin muss bleiben – sonst verwaltet niemand die Redaktion.',
                    ),
                  )
              : nichtGefunden(reply);
  return {
    ANTWORT,
    TOKEN,
    REGISTRIERUNG,
    keinCache,
    registrierungsFehler,
    admin,
    akteur,
    verwaltungsFehler,
  };
}
export type Kontext = ReturnType<typeof kontext>;
