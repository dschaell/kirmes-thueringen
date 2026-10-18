import { describe, expect, it } from 'vitest';
import {
  listenFilter,
  listenMeldung,
  markierte,
  nachAktion,
  zurueckLink,
} from '../src/lib/terminliste';

const ID = '15910cf3-efca-4e0f-8190-3578440e39c1';
const ID2 = 'a9bae049-50cb-463c-a94f-9245160c2e13';

describe('Rücksprung in die Redaktionsliste (Issue #90)', () => {
  it('übernimmt nur bekannte Filter von /admin', () => {
    const f = listenFilter('/admin?zeitraum=alle&q=Alkersleben&limit=25&offset=25&x=1');
    expect(f.toString()).toBe('q=Alkersleben&zeitraum=alle&offset=25');
  });

  it('ignoriert fremde Ziele, andere Pfade und Unsinn', () => {
    for (const ziel of [
      'https://evil.example/admin?q=x',
      '//evil.example/admin?q=x',
      '/\\evil.example/admin',
      '/admin/mitglieder?q=x',
      '/adminx?q=x',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ]) {
      expect(listenFilter(ziel).size).toBe(0);
    }
  });

  it('kürzt überlange Filterwerte', () => {
    expect(listenFilter(`/admin?q=${'a'.repeat(500)}`).get('q')).toHaveLength(100);
  });

  it('baut den Rücksprung-Link aus den aktuellen Parametern ohne limit', () => {
    const p = new URLSearchParams({ q: '', zeitraum: 'alle', limit: '25', offset: '0' });
    expect(zurueckLink(p)).toBe('/admin?zeitraum=alle&offset=0');
    expect(zurueckLink(new URLSearchParams())).toBe('/admin');
  });

  it('springt nach dem Speichern zurück und markiert den Termin', () => {
    expect(nachAktion('/admin?zeitraum=alle&q=Alkersleben', 'gespeichert', [ID])).toBe(
      `/admin?q=Alkersleben&zeitraum=alle&gespeichert=1&markiert=${ID}#termin-${ID}`,
    );
    expect(nachAktion('https://evil.example/', 'geloescht')).toBe('/admin?geloescht=1#terminliste');
  });

  it('filtert eine eingetragene Kirmes auf Ort und ersten Tag', () => {
    const ziel = nachAktion(null, 'gespeichert', [ID, ID2, 'kaputt'], {
      ort: 'alkersleben',
      von: '2026-10-15',
      zeitraum: 'alle',
    });
    const p = new URL(ziel, 'http://x').searchParams;
    expect(p.get('ort')).toBe('alkersleben');
    expect(p.get('von')).toBe('2026-10-15');
    expect(p.get('gespeichert')).toBe('3');
    expect(markierte(p)).toEqual([ID, ID2]);
    expect(ziel.endsWith('#terminliste')).toBe(true);
  });

  it('liest höchstens 20 gültige Markierungen', () => {
    const p = new URLSearchParams();
    for (let i = 0; i < 25; i++) p.append('markiert', ID);
    p.append('markiert', '<script>');
    expect(markierte(p)).toHaveLength(20);
  });

  it('nennt Anzahl und Ort in der Meldung', () => {
    expect(listenMeldung(new URLSearchParams('gespeichert=5'), 'Alkersleben')).toBe(
      '5 Termine für Alkersleben gespeichert.',
    );
    expect(listenMeldung(new URLSearchParams('gespeichert=1'))).toBe('Termin gespeichert.');
    expect(listenMeldung(new URLSearchParams('gespeichert=x'))).toBe('Termin gespeichert.');
    expect(listenMeldung(new URLSearchParams('gespeichert=99999'))).toBe(
      '100 Termine gespeichert.',
    );
    expect(listenMeldung(new URLSearchParams('bestaetigt=1'))).toBe('Termin bestätigt.');
    expect(listenMeldung(new URLSearchParams('geloescht=1'))).toBe('Termin gelöscht.');
    expect(listenMeldung(new URLSearchParams())).toBeNull();
  });
});
