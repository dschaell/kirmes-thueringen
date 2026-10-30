import { describe, expect, it } from 'vitest';
import { err, ok, Ortsprofile, validiereOrtsprofil, type Sitzung } from '../src/index.js';

const codes = (e: Parameters<typeof validiereOrtsprofil>[0]) => {
  const r = validiereOrtsprofil(e);
  return r.ok ? [] : r.error.map((f) => `${f.feld}:${f.code}`);
};

describe('Vereinsprofil (Issue #310)', () => {
  it('säubert Text, ergänzt https, normalisiert Hosts; leer = null', () => {
    const r = validiereOrtsprofil({
      text: '  Seit 1890\u0007 feiern   wir.\r\n\r\n\r\n\r\nKommt vorbei!  ',
      website: 'kv-muster.de',
      instagram: 'https://Instagram.com/kv_muster',
      facebook: 'm.facebook.com/kvmuster?ref=x',
      kontakt: ' info@kv-muster.de ',
    });
    expect(r).toEqual(
      ok({
        text: 'Seit 1890 feiern wir.\n\nKommt vorbei!',
        website: 'https://kv-muster.de/',
        instagram: 'https://instagram.com/kv_muster',
        facebook: 'https://m.facebook.com/kvmuster?ref=x',
        kontakt: 'info@kv-muster.de',
      }),
    );
    expect(validiereOrtsprofil({})).toEqual(
      ok({ text: null, website: null, instagram: null, facebook: null, kontakt: null }),
    );
  });
  it('lehnt http, fremde Hosts, Zugangsdaten und Überlängen ab', () => {
    expect(codes({ website: 'http://kv.de' })).toEqual(['website:LINK_UNGUELTIG']);
    expect(codes({ instagram: 'https://evil.example/instagram.com' })).toEqual([
      'instagram:LINK_UNGUELTIG',
    ]);
    expect(codes({ facebook: 'https://user@facebook.com/x' })).toEqual(['facebook:LINK_UNGUELTIG']);
    expect(codes({ website: 'javascript:alert(1)' })).toEqual(['website:LINK_UNGUELTIG']);
    expect(codes({ website: `https://kv.de/${'x'.repeat(300)}` })).toEqual([
      'website:LINK_UNGUELTIG',
    ]);
    expect(codes({ text: 'x'.repeat(801), kontakt: 'y'.repeat(201) })).toEqual([
      'text:TEXT_LAENGE',
      'kontakt:KONTAKT_LAENGE',
    ]);
  });
  it('KG nur am eigenen Ort; unbekannter Ort; Fehler kommen durch', async () => {
    const gesetzt: string[] = [];
    const p = new Ortsprofile({ setze: async (slug) => (gesetzt.push(slug), slug !== 'fehlt') });
    const kg: Sitzung = { adminId: '3', name: 'KG', rolle: 'kirmesgesellschaft', ortSlug: 'ulla' };
    const red: Sitzung = { adminId: '2', name: 'R', rolle: 'redaktion' };
    expect((await p.setze(kg, 'ulla', { text: 'Hallo' })).ok).toBe(true);
    expect(await p.setze(kg, 'mellingen', { text: 'x' })).toEqual(err('NUR_ADMIN'));
    expect(await p.setze(red, 'fehlt', {})).toEqual(err('NICHT_GEFUNDEN'));
    const f = await p.setze(red, 'ulla', { website: 'http://x.de' });
    expect(!f.ok && Array.isArray(f.error)).toBe(true);
    expect(gesetzt).toEqual(['ulla', 'fehlt']);
  });
});
