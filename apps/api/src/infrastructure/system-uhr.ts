import type { KalenderDatum, Uhr } from '@kirmes/core';

/** „Heute“ in Thüringer Ortszeit – nicht UTC, sonst springt das Datum nachts um 1–2 Uhr falsch. */
export class SystemUhr implements Uhr {
  private readonly fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });
  heute(): KalenderDatum {
    return this.fmt.format(new Date()) as KalenderDatum;
  }
}
