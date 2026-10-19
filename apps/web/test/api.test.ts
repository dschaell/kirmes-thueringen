import { describe, expect, it, vi } from 'vitest';
import { alleTermine } from '../src/lib/api';

describe('alleTermine blättert sicher (Code-Review #184)', () => {
  const mit = async (antwort: (offset: number) => object) => {
    let aufrufe = 0;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      aufrufe++;
      const offset = Number(new URL(String(url)).searchParams.get('offset') ?? 0);
      return Response.json(antwort(offset));
    });
    try {
      const t = await alleTermine({ ort: 'x' });
      return { anzahl: t.length, aufrufe };
    } finally {
      fetch.mockRestore();
    }
  };
  const seite = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
  it('ohne „gesamt“ nur eine Seite', async () => {
    expect(await mit(() => ({ termine: seite(200) }))).toEqual({ anzahl: 200, aufrufe: 1 });
  });
  it('blättert bis „gesamt“', async () => {
    expect(await mit((o) => ({ gesamt: 250, termine: seite(o ? 50 : 200) }))).toEqual({
      anzahl: 250,
      aufrufe: 2,
    });
  });
  it('höchstens 50 Seiten, auch wenn die API endlos liefert', async () => {
    expect((await mit(() => ({ gesamt: 1e9, termine: seite(200) }))).aufrufe).toBe(50);
  });
});
