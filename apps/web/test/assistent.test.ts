import { describe, expect, it } from 'vitest';
import { assistent, vorlage, leseProgramm } from '../src/lib/assistent';
describe('Kirmes-Assistent', () => {
  it('Alkersleben-Vorlage für 4 Tage, mit Kirche und Muttizettel', () => {
    const z = vorlage('2027-09-17', '4');
    expect(z.map((z) => [z.datum, z.beginn, z.titel])).toEqual([
      ['2027-09-17', '18:00', 'Kirmesgottesdienst'],
      ['2027-09-17', '20:00', 'Kirmestanz'],
      ['2027-09-18', '08:00', 'Ständchen'],
      ['2027-09-18', '15:00', 'Kinderkirmes'],
      ['2027-09-18', '20:00', 'Kirmesparty'],
      ['2027-09-19', '10:00', 'Frühschoppen'],
      ['2027-09-20', '10:00', 'Kirmesausklang'],
    ]);
    expect(z[0]?.veranstaltungsort).toBe('Kirche');
    expect(z[4]?.muttizettel).toBe(true);
    expect(vorlage('2027-09-17', '3')).toHaveLength(6);
    expect(vorlage('2027-09-17', '2')).toHaveLength(5);
    expect(vorlage('bad', '4')).toEqual([]);
    expect(vorlage('2027-09-17', '1')).toMatchObject([
      { datum: '2027-09-17', titel: '', aktiv: true },
    ]);
  });
  it('Zusammenbau erhält Zeilen trotz abgewählter Checkbox und eigene Veranstaltungen', () => {
    const alt = vorlage('2027-09-17', '2');
    const f = new FormData();
    alt.forEach((z, i) => {
      f.set(`datum-${i}`, z.datum);
      f.set(`beginn-${i}`, z.beginn ?? '');
      f.set(`titel-${i}`, i === 3 ? 'Eigener Kindertanz' : z.titel);
    });
    f.set('aktiv-1', 'on');
    f.set('aktiv-3', 'on');
    const z = leseProgramm(f, alt, false);
    expect(z.filter((z) => z.aktiv).map((z) => z.titel)).toEqual([
      'Kirmestanz',
      'Eigener Kindertanz',
    ]);
    expect(z[0]?.veranstaltungsort).toBe('Kirche');
  });
  it('freiwillige Details und Speisen werden derselben Veranstaltung zugeordnet', () => {
    const alt = vorlage('2027-09-17', '4');
    const f = new FormData();
    f.set('band-5', 'Band');
    f.set('wo-5', 'Saal');
    f.set('info-5', 'Eintritt frei');
    f.set('mutti-5', 'on');
    f.set('gericht-5-1', 'Klöße');
    f.set('preis-5-1', '9,50');
    expect(leseProgramm(f, alt, true)[5]).toMatchObject({
      titel: 'Frühschoppen',
      band: 'Band',
      veranstaltungsort: 'Saal',
      info: 'Eintritt frei',
      muttizettel: true,
      speisen: [{ name: 'Klöße', preis: '9,50' }],
    });
  });
});

it('Formularherkunft wird am externen Host geprüft, unabhängig von interner SSR-Adresse', async () => {
  const form = new FormData();
  form.set('csrf_token', 'token');
  form.set('stand', '{}');
  const response = { status: 200, headers: new Headers() };
  const ctx = {
    request: new Request('http://intern:4321/termin-melden', {
      method: 'POST',
      headers: { origin: 'https://example.org', host: 'example.org' },
      body: form,
    }),
    url: new URL('http://intern:4321/termin-melden'),
    response,
    cookies: { get: () => ({ value: 'token' }) } as never,
    redirect: () => new Response(null, { status: 303 }),
    clientAddress: '127.0.0.1',
  };
  const stand = await assistent(ctx, false);
  expect(stand).not.toBeInstanceOf(Response);
  expect(response.status).toBe(400);
  const fremd = await assistent(
    {
      ...ctx,
      request: new Request('http://intern:4321/termin-melden', {
        method: 'POST',
        headers: { origin: 'https://evil.example', host: 'example.org' },
        body: new FormData(),
      }),
    },
    false,
  );
  expect(fremd).toBeInstanceOf(Response);
  expect((fremd as Response).status).toBe(403);
});
