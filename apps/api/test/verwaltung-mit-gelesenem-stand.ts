/** Bestehende Integrationstests lesen wie die Oberfläche vor jeder beabsichtigten Änderung neu.
 * Konflikttests verwenden ausdrücklich den unveränderten PgTerminVerwaltung-Adapter. */
import type { Berechtigung, NeuerTermin, Speise } from '@kirmes/core';
import type pg from 'pg';
import { PgTerminVerwaltung } from '../src/infrastructure/postgres/termin-verwaltung.js';
import { PgTerminRepository } from '../src/infrastructure/postgres/termin-repository.js';
export class VerwaltungMitGelesenemStand extends PgTerminVerwaltung {
  private readonly lesen: PgTerminRepository;
  constructor(db: pg.Pool) {
    super(db);
    this.lesen = new PgTerminRepository(db);
  }
  async aendere(id: string, t: NeuerTermin, durch: Berechtigung) {
    return super.aendere(id, { ...t, version: (await this.lesen.finde(id))?.version }, durch);
  }
  async bestaetige(id: string, durch: Berechtigung) {
    return super.bestaetige(id, durch, (await this.lesen.finde(id))?.version);
  }
  async loesche(id: string, durch: Berechtigung) {
    return super.loesche(id, durch, (await this.lesen.finde(id))?.version);
  }
  async setzeSpeisen(id: string, speisen: readonly Speise[], durch: Berechtigung) {
    return super.setzeSpeisen(id, speisen, durch, (await this.lesen.finde(id))?.version);
  }
  async aendereAlle(
    aenderungen: { id: string; termin: NeuerTermin }[],
    loeschen: string[],
    durch: Berechtigung,
  ) {
    const versionen: Record<string, string> = {};
    for (const id of [...aenderungen.map((a) => a.id), ...loeschen])
      versionen[id] = (await this.lesen.finde(id))?.version ?? '';
    return super.aendereAlle(
      aenderungen.map((a) => ({ ...a, termin: { ...a.termin, version: versionen[a.id] } })),
      loeschen,
      durch,
      versionen,
    );
  }
}
