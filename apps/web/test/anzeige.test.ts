import { describe, expect, it } from 'vitest';
import {
  berlinVersatz,
  brotkrumenJsonLd,
  eventJsonLd,
  heute,
  kreisZusammenfassung,
  musikFeld,
  ohneSchraegstrich,
  routenLinks,
  suchZeitraum,
  wochenende,
} from '../src/lib/anzeige';

describe('heute (Thüringer Ortszeit)', () => {
  it('kurz nach Mitternacht ist schon der neue Tag – auch wenn UTC noch gestern ist', () => {
    // 00:30 Uhr MESZ = 22:30 Uhr UTC am Vortag
    expect(heute(new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17');
    // 00:30 Uhr MEZ (Winterzeit) = 23:30 Uhr UTC am Vortag
    expect(heute(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('kurz vor Mitternacht ist noch derselbe Tag', () => {
    expect(heute(new Date('2026-10-16T21:59:00Z'))).toBe('2026-10-16');
  });
});

describe('wochenende', () => {
  it('ab Freitag bis Sonntag, am Wochenende ab heute', () => {
    expect(wochenende('2026-10-14')).toEqual({ von: '2026-10-16', bis: '2026-10-18' }); // Mi
    expect(wochenende('2026-10-17')).toEqual({ von: '2026-10-17', bis: '2026-10-18' }); // Sa
    expect(wochenende('2026-10-18')).toEqual({ von: '2026-10-18', bis: '2026-10-18' }); // So
  });
});

describe('kreisZusammenfassung (#53)', () => {
  it('ist grammatisch richtig für 0, 1 und viele', () => {
    expect(kreisZusammenfassung(0, 0)).toBe('Noch keine kommenden Termine eingetragen.');
    expect(kreisZusammenfassung(1, 1)).toBe('1 kommender Termin in einem Ort.');
    expect(kreisZusammenfassung(3, 1)).toBe('3 kommende Termine in einem Ort.');
    expect(kreisZusammenfassung(1200, 14)).toBe('1.200 kommende Termine in 14 Orten.');
  });
});

describe('ohneSchraegstrich (#54)', () => {
  it('entfernt den abschließenden „/“, lässt die Startseite in Ruhe', () => {
    expect(ohneSchraegstrich('/impressum/')).toBe('/impressum');
    expect(ohneSchraegstrich('/impressum')).toBe('/impressum');
    expect(ohneSchraegstrich('/')).toBe('/');
    expect(ohneSchraegstrich('/orte/gotha//')).toBe('/orte/gotha');
  });
});

describe('suchZeitraum (#68)', () => {
  const h = '2026-10-16';
  it('ohne Suche: ab heute', () => {
    expect(suchZeitraum({ q: '', zeit: null, von: null }, h)).toEqual({
      zeit: 'kommend',
      von: h,
      text: '',
    });
  });
  it('mit Suche ohne Zeitraum: ein Jahr zurück bis ein Jahr voraus', () => {
    expect(suchZeitraum({ q: 'Alkersleben', zeit: null, von: null }, h)).toEqual({
      zeit: 'alle',
      von: '2025-10-16',
      bis: '2027-10-16',
      text: 'Alkersleben',
    });
  });
  it('Jahreszahl im Suchbegriff grenzt auf das Jahr ein', () => {
    expect(suchZeitraum({ q: 'Kirmes 2026', zeit: null, von: null }, h)).toEqual({
      zeit: 'jahr',
      von: '2026-01-01',
      bis: '2026-12-31',
      text: 'Kirmes',
    });
    expect(suchZeitraum({ q: 'Kirmes 26', zeit: null, von: null }, h).von).toBe('2026-01-01');
    expect(suchZeitraum({ q: '2025', zeit: 'alle', von: null }, h)).toMatchObject({
      von: '2025-01-01',
      text: '',
    });
    // Zahlen, die keine Jahre sind, bleiben Suchtext
    expect(suchZeitraum({ q: 'Kirmes 8', zeit: null, von: null }, h).text).toBe('Kirmes 8');
  });
  it('vergangene Termine: letztes Jahr bis gestern', () => {
    expect(suchZeitraum({ q: '', zeit: 'vergangen', von: null }, h)).toMatchObject({
      von: '2025-10-16',
      bis: '2026-10-15',
    });
  });
  it('Wochenende, ganzes Jahr, ab Datum, unbekannter Wert', () => {
    expect(suchZeitraum({ q: '', zeit: 'wochenende', von: null }, h).zeit).toBe('wochenende');
    expect(suchZeitraum({ q: '', zeit: 'jahr', von: null }, h)).toMatchObject({
      von: '2026-01-01',
      bis: '2026-12-31',
    });
    expect(suchZeitraum({ q: '', zeit: 'kommend', von: '2026-11-01' }, h).von).toBe('2026-11-01');
    expect(suchZeitraum({ q: '', zeit: 'quatsch', von: null }, h).zeit).toBe('kommend');
  });
});

describe('datumKurz (Issue #87)', () => {
  it('kurz mit Wochentag, Unsinn bleibt leer', async () => {
    const { datumKurz } = await import('../src/lib/anzeige');
    expect(datumKurz('2026-11-05')).toBe('Do., 05.11.');
    expect(datumKurz('')).toBe('');
    expect(datumKurz('2026-13-45')).toBe('');
  });
});

describe('artName (robust gegen unbekannte Arten)', () => {
  it('Name, Kurzname, unbekannt → Rohwert', async () => {
    const { artName } = await import('../src/lib/anzeige');
    expect(artName('familie')).toBe('Kindertanz');
    expect(artName('party', true)).toBe('Kirmestanz/Disco');
    expect(artName('gibtsnicht')).toBe('gibtsnicht');
  });
});

describe('routenLinks (Issue #179)', () => {
  const ort = (koordinate: object | null) =>
    ({ slug: 'muehlberg', name: 'Mühlberg', landkreis: 'GTH', koordinate }) as never;
  const ziel = (r: ReturnType<typeof routenLinks>) =>
    r && decodeURIComponent(r.google.split('destination=')[1] ?? '');
  it('Platz → genau; ohne „Wo genau?“ → Ortsmitte; nur Text → keine Route', () => {
    const mitte = ort({ lat: 50.87, lon: 10.82 });
    const platz = { festplatz: { lat: 50.9, lon: 10.8 }, veranstaltungsort: 'Kirche', ort: mitte };
    expect(routenLinks(platz)?.art).toBe('genau');
    expect(ziel(routenLinks(platz))).toBe('50.9,10.8');
    const ohne = routenLinks({ festplatz: null, veranstaltungsort: null, ort: mitte });
    expect([ohne?.art, ziel(ohne)]).toEqual(['ort', '50.87,10.82']);
    expect(ohne?.apple).toContain('daddr=50.87%2C10.82');
    expect(ziel(routenLinks({ festplatz: null, veranstaltungsort: null, ort: ort(null) }))).toBe(
      'Mühlberg, Thüringen',
    );
    expect(
      routenLinks({ festplatz: null, veranstaltungsort: 'Sportplatz', ort: mitte }),
    ).toBeNull();
  });
});

describe('musikFeld (Issue #175)', () => {
  it('Gottesdienst: Chor statt Band', () => {
    expect(musikFeld('tradition')).toBe('Chor / Gesang / musikalische Begleitung');
    expect(musikFeld('party')).toBe('Band / DJ');
    expect(musikFeld(null)).toBe('Band / DJ');
  });
});

describe('SEO: Event- und Brotkrumen-Daten (Issue #182)', () => {
  const site = new URL('https://k.de');
  const termin = (x: object = {}) =>
    ({
      id: 'abc',
      datum: '2026-10-24',
      beginn: '20:00',
      titel: 'Kirmestanz',
      veranstaltungsort: 'Festzelt',
      kategorie: 'party',
      bestaetigt: true,
      ort: { slug: 'elleben', name: 'Elleben', landkreis: 'IK', koordinate: null },
      festplatz: null,
      band: 'Belconda',
      info: null,
      muttizettel: false,
      ...x,
    }) as never;
  it('Zeitzone Sommer/Winter', () => {
    expect(berlinVersatz('2026-10-24')).toBe('+02:00');
    expect(berlinVersatz('2026-10-26')).toBe('+01:00');
  });
  it('Start mit Zeitzone, Ende nach Art (über Mitternacht), Beschreibung, Bild', () => {
    const e = eventJsonLd(termin(), site);
    expect(e.startDate).toBe('2026-10-24T20:00:00+02:00');
    expect(e.endDate).toBe('2026-10-25T01:00:00+01:00');
    expect(e.location.name).toBe('Festzelt, Elleben');
    expect(e.description).toBe(
      'Kirmestanz/Kirmesdisco in Elleben am Samstag, 24. Oktober ab 20:00 Uhr mit Belconda.',
    );
    expect(e.image).toEqual(['https://k.de/termin/abc/bild.png']);
    const ganztags = eventJsonLd(
      termin({ beginn: null, info: 'Eintritt frei', band: null, veranstaltungsort: null }),
      site,
    );
    expect([
      ganztags.startDate,
      ganztags.endDate,
      ganztags.description,
      ganztags.location.name,
    ]).toEqual(['2026-10-24', '2026-10-24', 'Eintritt frei', 'Elleben']);
    expect(eventJsonLd(termin({ kategorie: 'unbekannt' }), site).endDate).toBe(
      '2026-10-24T23:00:00+02:00',
    );
  });
  it('Brotkrumen ab Start, mit Positionen', () => {
    expect(brotkrumenJsonLd([['Ilm-Kreis', '/kreise/ik']], site).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Kirmeskalender Thüringen', item: 'https://k.de/' },
      { '@type': 'ListItem', position: 2, name: 'Ilm-Kreis', item: 'https://k.de/kreise/ik' },
    ]);
  });
});
