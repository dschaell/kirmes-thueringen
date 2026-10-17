/** Erwartbarer Schreibkonflikt; niemals als interner Serverfehler anzeigen. */
export class TerminKonflikt extends Error {
  constructor(
    readonly code: 'DOPPELT' | 'VERALTET',
    readonly terminId?: string,
  ) {
    super(
      code === 'DOPPELT'
        ? 'Diesen Termin gibt es bereits. Bitte den vorhandenen Termin öffnen und bearbeiten. Deine Eingaben wurden nicht gespeichert.'
        : 'Der Termin wurde inzwischen geändert. Deine Eingaben wurden nicht gespeichert. Bitte mit dem aktuellen Stand vergleichen und die Seite neu öffnen.',
    );
    this.name = 'TerminKonflikt';
  }
}
export class LetzterAdmin extends Error {
  constructor() {
    super('Mindestens ein Admin muss bleiben – sonst verwaltet niemand die Redaktion.');
    this.name = 'LetzterAdmin';
  }
}
