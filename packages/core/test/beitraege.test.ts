import { describe, expect, it } from 'vitest';
import {
  BEITRAG_MAX_FOTOS,
  BEITRAG_MAX_TEXT,
  Beitraege,
  err,
  FOTO_ALT_MAX,
  FOTOS_JE_ORT_MAX,
  ok,
  PLAKAT_MAX_BYTES,
  pushText,
  type Beitrag,
  type BeitragAblage,
  type Plakatbild,
  type Sitzung,
} from '../src/index.js';

const admin: Sitzung = { adminId: '1', name: 'A', rolle: 'admin' };
const kg: Sitzung = { adminId: '3', name: 'KG', rolle: 'kirmesgesellschaft', ortSlug: 'ulla' };
const bild: Plakatbild = {
  gross: new Uint8Array([1]),
  klein: new Uint8Array([2]),
  breite: 800,
  hoehe: 600,
};
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

function aufbau(o: { wandelbar?: boolean; fotosImOrt?: number } = {}) {
  type Eintrag = {
    ortSlug: string;
    text: string;
    terminId: string | null;
    fertig: boolean;
    fotos: string[];
  };
  const beitraege = new Map<string, Eintrag>();
  const fotos = new Map<string, Plakatbild>();
  let n = 0;
  const alsBeitrag = (id: string, e: Eintrag): Beitrag => ({
    id,
    ortSlug: e.ortSlug,
    ortName: 'Ulla',
    kgName: null,
    text: e.text,
    termin: null,
    veroeffentlichtAm: e.fertig ? '2026-11-01T10:00:00Z' : null,
    fotos: e.fotos.map((f) => ({ id: f, breite: 800, hoehe: 600, alt: '' })),
  });
  const ablage: BeitragAblage = {
    lege: async (b) => {
      if (b.ortSlug === 'unbekannt') return null;
      const id = `0000000${++n}-0000-4000-8000-000000000000`;
      beitraege.set(id, { ...b, fertig: false, fotos: [] });
      return id;
    },
    terminImOrt: async (t, ort) =>
      (t === T1 && ort === 'ulla') || (t === T2 && ort === 'mellingen'),
    stand: async (id) => {
      const e = beitraege.get(id);
      return e
        ? { ortSlug: e.ortSlug, veroeffentlicht: e.fertig, fotos: e.fotos.length, text: e.text }
        : null;
    },
    fotosImOrt: async () => o.fotosImOrt ?? 0,
    legeFoto: async (id, nr, b) => {
      const f = `${id}-${nr}`;
      fotos.set(f, b);
      beitraege.get(id)?.fotos.push(f);
      return f;
    },
    veroeffentliche: async (id) => {
      const e = beitraege.get(id);
      if (!e) return null;
      e.fertig = true;
      return alsBeitrag(id, e);
    },
    loesche: async (id) => beitraege.delete(id),
    liste: async (f) =>
      [...beitraege]
        .filter(([, e]) => e.fertig && (!f.ortSlug || e.ortSlug === f.ortSlug))
        .slice(0, f.limit)
        .map(([id, e]) => alsBeitrag(id, e)),
    foto: async (id, g) => fotos.get(id)?.[g] ?? null,
  };
  const gemeldet: Beitrag[] = [];
  const b = new Beitraege(
    ablage,
    { wandle: async () => (o.wandelbar === false ? null : bild) },
    async (x) => {
      gemeldet.push(x);
    },
  );
  return { b, beitraege, gemeldet, ablage };
}
const neu = { ortSlug: 'ulla', text: 'Kirmesbaum steht!', einverstanden: true };

describe('Beiträge mit Fotos (Issue #352)', () => {
  it('Entwurf → Fotos → veröffentlichen, dann öffentlich und gemeldet', async () => {
    const { b, gemeldet } = aufbau();
    const r = await b.schreibe(kg, { ...neu, terminId: T1 });
    if (!r.ok) throw new Error('erwartet ok');
    expect(await b.liste()).toEqual([]);
    const f = await b.fuegeFotoHinzu(kg, r.value.id, new Uint8Array(5), '  Baum  am Anger ');
    expect(f.ok).toBe(true);
    const v = await b.veroeffentliche(kg, r.value.id);
    expect(v.ok && v.value.fotos.length).toBe(1);
    expect(gemeldet).toHaveLength(1);
    expect(await b.liste({ ortSlug: 'ulla' })).toHaveLength(1);
    expect(await b.liste({ ortSlug: 'mellingen' })).toHaveLength(0);
    expect(await b.foto(f.ok ? f.value.id : '', 'klein')).toBeNull(); // keine UUID
    expect(await b.veroeffentliche(kg, r.value.id)).toEqual(err('VEROEFFENTLICHT'));
    expect(await b.fuegeFotoHinzu(kg, r.value.id, new Uint8Array(1), '')).toEqual(
      err('VEROEFFENTLICHT'),
    );
  });
  it('Kirmesgesellschaft nur am eigenen Ort, ohne Rolle nichts', async () => {
    const { b } = aufbau();
    expect(await b.schreibe(kg, { ...neu, ortSlug: 'mellingen' })).toEqual(err('NICHT_GEFUNDEN'));
    const ohneRolle = { adminId: '9', name: 'X' } as Sitzung;
    expect(await b.schreibe(ohneRolle, neu)).toEqual(err('NUR_ADMIN'));
    const fremd = await b.schreibe(admin, { ...neu, ortSlug: 'mellingen' });
    if (!fremd.ok) throw new Error('erwartet ok');
    expect(await b.fuegeFotoHinzu(kg, fremd.value.id, new Uint8Array(1), '')).toEqual(
      err('NICHT_GEFUNDEN'),
    );
    expect(await b.veroeffentliche(kg, fremd.value.id)).toEqual(err('NICHT_GEFUNDEN'));
    expect(await b.entferne(kg, fremd.value.id)).toEqual(err('NICHT_GEFUNDEN'));
    expect(await b.entferne(admin, fremd.value.id)).toEqual(ok(true));
    expect(await b.entferne(admin, fremd.value.id)).toEqual(err('NICHT_GEFUNDEN'));
    expect(await b.entferne(admin, 'keine-uuid')).toEqual(err('NICHT_GEFUNDEN'));
  });
  it('prüft Einwilligung, Text, Termin und Ort', async () => {
    const { b } = aufbau();
    expect(await b.schreibe(kg, { ...neu, einverstanden: false })).toEqual(err('EINWILLIGUNG'));
    expect(await b.schreibe(kg, { ...neu, text: 'x'.repeat(BEITRAG_MAX_TEXT + 1) })).toEqual(
      err('TEXT'),
    );
    expect(await b.schreibe(kg, { ...neu, terminId: T2 })).toEqual(err('TERMIN'));
    expect(await b.schreibe(kg, { ...neu, terminId: 'quatsch' })).toEqual(err('TERMIN'));
    expect(await b.schreibe(admin, { ...neu, ortSlug: 'unbekannt' })).toEqual(
      err('NICHT_GEFUNDEN'),
    );
  });
  it('Text wird bereinigt; leerer Beitrag ohne Foto lässt sich nicht veröffentlichen', async () => {
    const { b, beitraege } = aufbau();
    const r = await b.schreibe(kg, { ...neu, text: ' a\r\n\n\n\nb\u0007 ' });
    if (!r.ok) throw new Error('erwartet ok');
    expect(beitraege.get(r.value.id)?.text).toBe('a\n\nb');
    const leer = await b.schreibe(kg, { ...neu, text: '   ' });
    if (!leer.ok) throw new Error('erwartet ok');
    expect(await b.veroeffentliche(kg, leer.value.id)).toEqual(err('LEER'));
  });
  it('Fotos: Größe, Anzahl, Beschreibung, Speicher, kein Bild', async () => {
    const { b } = aufbau();
    const r = await b.schreibe(kg, neu);
    if (!r.ok) throw new Error('erwartet ok');
    const id = r.value.id;
    expect(await b.fuegeFotoHinzu(kg, id, new Uint8Array(PLAKAT_MAX_BYTES + 1), '')).toEqual(
      err('ZU_GROSS'),
    );
    expect(await b.fuegeFotoHinzu(kg, id, new Uint8Array(1), 'x'.repeat(FOTO_ALT_MAX + 1))).toEqual(
      err('ALT'),
    );
    for (let i = 0; i < BEITRAG_MAX_FOTOS; i++)
      expect((await b.fuegeFotoHinzu(kg, id, new Uint8Array(1), '')).ok).toBe(true);
    expect(await b.fuegeFotoHinzu(kg, id, new Uint8Array(1), '')).toEqual(err('ZU_VIELE_FOTOS'));
    const voll = aufbau({ fotosImOrt: FOTOS_JE_ORT_MAX });
    const r2 = await voll.b.schreibe(kg, neu);
    if (!r2.ok) throw new Error('erwartet ok');
    expect(await voll.b.fuegeFotoHinzu(kg, r2.value.id, new Uint8Array(1), '')).toEqual(
      err('SPEICHER'),
    );
    const kaputt = aufbau({ wandelbar: false });
    const r3 = await kaputt.b.schreibe(kg, neu);
    if (!r3.ok) throw new Error('erwartet ok');
    expect(await kaputt.b.fuegeFotoHinzu(kg, r3.value.id, new Uint8Array(1), '')).toEqual(
      err('KEIN_BILD'),
    );
  });
  it('Liste begrenzt und prüft den Zeitpunkt, Fotos nur mit gültiger Kennung', async () => {
    const { b, ablage } = aufbau();
    const gerufen: unknown[] = [];
    ablage.liste = async (f) => {
      gerufen.push(f);
      return [];
    };
    await b.liste({ limit: 500, vor: 'gestern' });
    await b.liste({ limit: 0, vor: '2026-11-01T10:00:00Z', ortSlug: 'ulla' });
    expect(gerufen).toEqual([
      { ortSlug: undefined, vor: undefined, limit: 50 },
      { ortSlug: 'ulla', vor: '2026-11-01T10:00:00Z', limit: 1 },
    ]);
    ablage.foto = async () => new Uint8Array([7]);
    expect(await b.foto(T1, 'gross')).toEqual(new Uint8Array([7]));
  });
  it('Fehler beim Melden halten das Veröffentlichen nicht auf', async () => {
    const { ablage } = aufbau();
    const b = new Beitraege(ablage, { wandle: async () => bild }, async () => {
      throw new Error('Push kaputt');
    });
    const r = await b.schreibe(kg, neu);
    if (!r.ok) throw new Error('erwartet ok');
    expect((await b.veroeffentliche(kg, r.value.id)).ok).toBe(true);
    const ohne = new Beitraege(ablage, { wandle: async () => bild });
    const r2 = await ohne.schreibe(kg, neu);
    expect(r2.ok && (await ohne.veroeffentliche(kg, r2.value.id)).ok).toBe(true);
  });
  it('Beitrag verschwindet beim Veröffentlichen (gleichzeitig gelöscht)', async () => {
    const { b, ablage } = aufbau();
    const r = await b.schreibe(kg, neu);
    if (!r.ok) throw new Error('erwartet ok');
    ablage.veroeffentliche = async () => null;
    expect(await b.veroeffentliche(kg, r.value.id)).toEqual(err('NICHT_GEFUNDEN'));
  });
  it('Push-Text: Textanfang oder Zahl der Fotos', () => {
    const basis: Beitrag = {
      id: 'b1',
      ortSlug: 'ulla',
      ortName: 'Ulla',
      kgName: 'KG Ulla',
      text: '',
      termin: null,
      veroeffentlichtAm: null,
      fotos: [{ id: 'f', breite: 1, hoehe: 1, alt: '' }],
    };
    expect(pushText.beitrag(basis)).toEqual({
      titel: 'Neu aus Ulla – KG Ulla',
      text: 'Ein neues Foto',
      url: '/orte/ulla#beitrag-b1',
      tag: 'beitrag-b1',
    });
    expect(
      pushText.beitrag({ ...basis, kgName: null, fotos: [basis.fotos[0]!, basis.fotos[0]!] }).text,
    ).toBe('2 neue Fotos');
    expect(pushText.beitrag({ ...basis, text: 'Hallo\nWelt' }).text).toBe('Hallo Welt');
    expect(pushText.beitrag({ ...basis, text: 'x'.repeat(200) }).text).toHaveLength(120);
  });
});
