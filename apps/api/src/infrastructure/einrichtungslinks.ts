/**
 * Einrichtungslinks für den ersten Redaktionszugang (Issue #48): nur im Arbeitsspeicher,
 * 30 Minuten gültig. Nach einem Neustart der API muss man einfach einen neuen Link anfordern.
 */
import { EINRICHTUNG_MINUTEN, type Einrichtungslinks } from '@kirmes/core';
import { randomBytes } from 'node:crypto';

export class SpeicherEinrichtungslinks implements Einrichtungslinks {
  private readonly offen = new Map<string, number>();

  constructor(
    private readonly gueltigMs = EINRICHTUNG_MINUTEN * 60_000,
    private readonly max = 20,
    private readonly jetzt: () => number = Date.now,
  ) {}

  lege(): string {
    const t = this.jetzt();
    for (const [k, bis] of this.offen) if (bis < t) this.offen.delete(k);
    // Überfüllt: den ältesten Link verdrängen (Map behält die Einfügereihenfolge)
    if (this.offen.size >= this.max) this.offen.delete([...this.offen.keys()][0] ?? '');
    const link = randomBytes(32).toString('base64url');
    this.offen.set(link, t + this.gueltigMs);
    return link;
  }

  gueltig(link: string): boolean {
    const bis = this.offen.get(link);
    if (bis === undefined) return false;
    if (bis < this.jetzt()) {
      this.offen.delete(link);
      return false;
    }
    return true;
  }

  verbrauche(link: string): void {
    this.offen.delete(link);
  }
}
