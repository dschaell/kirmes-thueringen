import { describe, expect, it } from 'vitest';
import { KachelSpeicher, kachelErlaubt, vonUns } from '../src/lib/kacheln';

describe('Kachel-Proxy nur für Thüringen (#103)', () => {
  it('erlaubt Kacheln in Thüringen, kleine Zoomstufen überall', () => {
    expect(kachelErlaubt('12', '2173', '1373')).toEqual([12, 2173, 1373]); // Alkersleben
    expect(kachelErlaubt('3', '4', '2')).toEqual([3, 4, 2]);
    expect(kachelErlaubt('8', '135', '85')).not.toBeNull();
  });
  it('lehnt fremde Gegenden, Unsinn und zu große Zoomstufen ab', () => {
    expect(kachelErlaubt('12', '2048', '1362')).toBeNull(); // Paris
    expect(kachelErlaubt('20', '1', '1')).toBeNull();
    expect(kachelErlaubt('2', '4', '0')).toBeNull();
    expect(kachelErlaubt('12', '-1', '2')).toBeNull();
    expect(kachelErlaubt('12', '2173', '1373.png')).toBeNull();
    expect(kachelErlaubt('1e3', '0', '0')).toBeNull();
  });
  it('Speicher vergisst Ältestes und Abgelaufenes', () => {
    const s = new KachelSpeicher(2, 1000);
    const b = new ArrayBuffer(1);
    s.lege('a', b, 0);
    s.lege('b', b, 0);
    expect(s.hole('a', 10)).toBe(b); // a jetzt zuletzt benutzt
    s.lege('c', b, 0);
    expect(s.hole('b', 10)).toBeNull();
    expect(s.hole('a', 10)).toBe(b);
    expect(s.hole('a', 5000)).toBeNull();
    expect(s.groesse).toBe(1);
  });
  it('nur Anfragen von der eigenen Seite', () => {
    expect(vonUns(new Headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(vonUns(new Headers())).toBe(true);
    expect(vonUns(new Headers({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });
});
