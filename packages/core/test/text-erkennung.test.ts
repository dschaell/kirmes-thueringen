import { describe, expect, it } from 'vitest';
import { erkenneTerminAusText } from '../src/index.js';

const HEUTE = '2026-10-14';

describe('erkenneTerminAusText (Recherche-Assistent)', () => {
  it('typischer Instagram-Post mit Emojis und Hashtags', () => {
    const post = `🎉🎪 KIRMESTANZ mit "Belconda" 🎶
Samstag, 17. Oktober ab 20 Uhr im Festzelt
Wir freuen uns auf euch! #kirmes #thüringen @kg_muehlberg`;
    expect(erkenneTerminAusText(post, HEUTE)).toEqual({
      datum: '2026-10-17',
      beginn: '20:00',
      titel: 'KIRMESTANZ mit „Belconda“',
      veranstaltungsort: 'Festzelt',
    });
  });

  it('Datum in Zahlen mit Jahr und Uhrzeit mit Punkt', () => {
    const r = erkenneTerminAusText(
      'Kindertanz am 18.10.2026, Beginn 14.30 Uhr, Kulturhaus Ulla',
      HEUTE,
    );
    expect(r).toMatchObject({
      datum: '2026-10-18',
      beginn: '14:30',
      veranstaltungsort: 'Kulturhaus Ulla',
    });
    expect(r.titel).toBe('Kindertanz');
  });

  it('ohne Jahr: nächstes Vorkommen ab heute', () => {
    expect(erkenneTerminAusText('Maikirmes 1. Mai', HEUTE).datum).toBe('2027-05-01');
    expect(erkenneTerminAusText('Kirmes 24.10.', HEUTE).datum).toBe('2026-10-24');
    expect(erkenneTerminAusText('Kirmes 24.10.26', HEUTE).datum).toBe('2026-10-24');
  });

  it('nimmt das erste Datum im Text', () => {
    expect(erkenneTerminAusText('Kirmes vom 16. bis 19. Oktober 2026', HEUTE).datum).toBe(
      '2026-10-16',
    );
    expect(erkenneTerminAusText('Kirmes 16.–19. Okt', HEUTE).datum).toBe('2026-10-16');
    expect(erkenneTerminAusText('Kirmes 16.10. bis 19.10.', HEUTE).datum).toBe('2026-10-16');
  });

  it('liefert leere Felder, wenn nichts erkennbar ist', () => {
    expect(erkenneTerminAusText('Danke an alle Helfer!', HEUTE)).toEqual({
      datum: null,
      beginn: null,
      titel: 'Danke an alle Helfer',
      veranstaltungsort: null,
    });
    expect(erkenneTerminAusText('', HEUTE)).toEqual({
      datum: null,
      beginn: null,
      titel: null,
      veranstaltungsort: null,
    });
    expect(erkenneTerminAusText('Start 25 Uhr', HEUTE).beginn).toBeNull();
  });

  it('trennt Titel, Ort und Hashtags sauber (Fall aus dem Praxistest)', () => {
    expect(
      erkenneTerminAusText(
        'Kirmestanz mit "Testband" - Samstag, 7. November ab 20 Uhr im Festzelt #kirmes',
        HEUTE,
      ),
    ).toEqual({
      datum: '2026-11-07',
      beginn: '20:00',
      titel: 'Kirmestanz mit „Testband“',
      veranstaltungsort: 'Festzelt',
    });
  });
});
