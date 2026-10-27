import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  einladungsMail,
  MitmachAnfragen,
  type Anfrage,
  type AnfragenRepository,
  type Nachricht,
  type Sitzung,
} from '../src/index.js';

const admin: Sitzung = { adminId: '1', name: 'Admin', rolle: 'admin' };
const redaktion: Sitzung = { adminId: '2', name: 'Red', rolle: 'redaktion' };

function aufbau(o: { versandFehler?: boolean; ladeFehler?: boolean } = {}) {
  const anfragen = new Map<string, Anfrage>([
    [
      'a1',
      {
        id: 'a1',
        eingegangenAm: '2026-10-27T10:00:00Z',
        name: 'Lisa',
        email: 'lisa@example.org',
        ort: 'Mühlberg',
        info: null,
        status: 'offen',
        erledigtAm: null,
        erledigtVon: null,
      },
    ],
  ]);
  const repo: AnfragenRepository = {
    lege: async () => true,
    liste: async () => [...anfragen.values()],
    finde: async (id) => anfragen.get(id) ?? null,
    erledige: async (id, status) => {
      const a = anfragen.get(id);
      if (!a || a.status !== 'offen') return false;
      anfragen.set(id, { ...a, status, email: null });
      return true;
    },
    raeumeAuf: async () => {},
  };
  const geladen: unknown[] = [];
  const widerrufen: string[] = [];
  const mitglieder = {
    lade: async (_a: Sitzung, rolle: string, bezeichnung = '', ortSlug = '') => {
      geladen.push({ rolle, bezeichnung, ortSlug });
      return o.ladeFehler
        ? err('ORT_FEHLT' as const)
        : ok({
            id: 'e1',
            rolle,
            token: 'tok/+',
            ortName: ortSlug ? 'Mühlberg' : null,
            erstelltAm: '',
            laeuftAb: '',
          });
    },
    widerrufe: async (_a: Sitzung, id: string) => (widerrufen.push(id), ok(true as const)),
  };
  const post: { an: string; n: Nachricht }[] = [];
  const m = new MitmachAnfragen(
    repo,
    mitglieder as never,
    {
      sendeAn: async (an, n) => {
        if (o.versandFehler) throw new Error('SMTP');
        post.push({ an, n });
      },
    },
    'https://k.de/',
  );
  return { m, anfragen, geladen, widerrufen, post };
}

describe('Mitmach-Anfragen (Issue #279)', () => {
  it('nur Admins sehen und entscheiden', async () => {
    const { m } = aufbau();
    expect(await m.liste(redaktion)).toEqual(err('NUR_ADMIN'));
    expect(await m.nimmAn(redaktion, 'a1', 'redaktion')).toEqual(err('NUR_ADMIN'));
    expect(await m.lehneAb(redaktion, 'a1')).toEqual(err('NUR_ADMIN'));
    expect((await m.liste(admin)).ok).toBe(true);
  });

  it('Annehmen: Einladung mit Namen und Ort, Link per Mail, Anfrage erledigt', async () => {
    const { m, anfragen, geladen, post } = aufbau();
    expect(await m.nimmAn(admin, 'a1', 'kirmesgesellschaft', 'muehlberg')).toEqual(
      ok({ email: 'lisa@example.org' }),
    );
    expect(geladen).toEqual([
      { rolle: 'kirmesgesellschaft', bezeichnung: 'Lisa', ortSlug: 'muehlberg' },
    ]);
    expect(post[0]?.an).toBe('lisa@example.org');
    expect(post[0]?.n.text).toContain('https://k.de/admin/einladung?t=tok%2F%2B');
    expect(post[0]?.n.text).toContain('Kirmesgesellschaft in Mühlberg');
    expect(anfragen.get('a1')).toMatchObject({ status: 'angenommen', email: null });
    expect(await m.nimmAn(admin, 'a1', 'redaktion')).toEqual(err('ERLEDIGT'));
    expect(await m.lehneAb(admin, 'a1')).toEqual(err('ERLEDIGT'));
  });

  it('Versand scheitert: Einladung widerrufen, Anfrage bleibt offen', async () => {
    const { m, anfragen, widerrufen } = aufbau({ versandFehler: true });
    expect(await m.nimmAn(admin, 'a1', 'redaktion')).toEqual(err('VERSAND'));
    expect(widerrufen).toEqual(['e1']);
    expect(anfragen.get('a1')?.status).toBe('offen');
  });

  it('Fehler der Einladung (z. B. Ort fehlt) kommen durch; unbekannte Anfrage', async () => {
    const { m, post } = aufbau({ ladeFehler: true });
    expect(await m.nimmAn(admin, 'a1', 'kirmesgesellschaft')).toEqual(err('ORT_FEHLT'));
    expect(post).toEqual([]);
    expect(await m.nimmAn(admin, 'x', 'redaktion')).toEqual(err('NICHT_GEFUNDEN'));
    expect(await m.lehneAb(admin, 'x')).toEqual(err('NICHT_GEFUNDEN'));
  });

  it('Ablehnen ohne Mail', async () => {
    const { m, anfragen, post } = aufbau();
    expect(await m.lehneAb(admin, 'a1')).toEqual(ok(true));
    expect(anfragen.get('a1')?.status).toBe('abgelehnt');
    expect(post).toEqual([]);
  });

  it('Einladungstext je Rolle', () => {
    expect(einladungsMail('Jo', 'kirmesgesellschaft', 'L', 'X').text).toContain(
      'eure Kirmestermine und Festplätze selbst eintragen',
    );
    expect(einladungsMail('Jo', 'redaktion', 'L').text).toContain(
      'Vorschläge von Besuchern freigeben',
    );
    expect(einladungsMail('Jo', 'admin', 'L').text).toContain('Mitglieder verwalten');
    expect(einladungsMail('Jo', 'redaktion', 'L').text).toContain('in der Redaktion mitmachen');
    expect(einladungsMail('Jo', 'kirmesgesellschaft', 'L', null).text).toContain(
      'in der Kirmesgesellschaft mitmachen',
    );
  });
});
