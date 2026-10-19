/**
 * Stand der Datenbanksicherungen als eine Zeile für Admins (Issue #45). Warnung, wenn die letzte
 * tägliche Sicherung älter als 36 Stunden ist, fehlgeschlagen ist oder der Offsite-Upload hakt.
 */
export interface SicherungsStand {
  status: {
    zeit: string;
    lokal: 'ok' | 'fehler';
    datei: string;
    groesse: number;
    offsite: 'ok' | 'fehler' | 'aus';
    meldung: string;
  } | null;
  dateien: { name: string; groesse: number; zeit: string }[];
}

const zeitFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

export const groesse = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('de-DE')} kB`;

export function sicherungsZeile(
  stand: SicherungsStand,
  jetzt: Date = new Date(),
): { text: string; warnung: boolean } {
  const s = stand.status;
  if (!s) return { text: 'Noch keine tägliche Sicherung gemeldet.', warnung: true };
  const alter = jetzt.getTime() - Date.parse(s.zeit);
  const wann = `${zeitFormat.format(new Date(s.zeit))} Uhr`;
  if (s.lokal !== 'ok')
    return {
      text: `Letzte Sicherung am ${wann} fehlgeschlagen${s.meldung ? `: ${s.meldung}` : '.'}`,
      warnung: true,
    };
  const teile = [`Letzte Sicherung: ${wann} (${groesse(s.groesse)})`];
  if (s.offsite === 'ok') teile.push('auch extern gespeichert');
  if (s.offsite === 'fehler')
    teile.push(`externe Kopie fehlgeschlagen${s.meldung ? `: ${s.meldung}` : ''}`);
  const veraltet = alter > 36 * 3_600_000;
  if (veraltet) teile.push('älter als 36 Stunden – bitte prüfen');
  return { text: `${teile.join(' · ')}.`, warnung: veraltet || s.offsite === 'fehler' };
}
