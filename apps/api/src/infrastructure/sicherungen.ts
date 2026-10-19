/**
 * Stand der Datenbanksicherungen für die Redaktion (Issue #45): liest das nur lesend eingebundene
 * Sicherungsverzeichnis (status.json des Sicherungs-Containers + Dateiliste). So sehen Admins ohne
 * Serverzugang, ob täglich gesichert wird. Nur bekannte Dateinamen, nie Inhalte.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface SicherungsDatei {
  name: string;
  groesse: number;
  zeit: string;
}
export interface SicherungsUebersicht {
  status: {
    zeit: string;
    lokal: 'ok' | 'fehler';
    datei: string;
    groesse: number;
    offsite: 'ok' | 'fehler' | 'aus';
    meldung: string;
  } | null;
  dateien: SicherungsDatei[];
}

const DATEI = /^(kirmes-\d{4}-\d{2}-\d{2}|vor-update-\d{4}-\d{2}-\d{2}-\d{6})\.dump$/;
const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

function leseStatus(roh: string): SicherungsUebersicht['status'] {
  try {
    const s = JSON.parse(roh) as Record<string, unknown>;
    const lokal = s.lokal === 'ok' ? 'ok' : 'fehler';
    const offsite = s.offsite === 'ok' || s.offsite === 'fehler' ? s.offsite : 'aus';
    if (!text(s.zeit) || Number.isNaN(Date.parse(text(s.zeit)))) return null;
    return {
      zeit: text(s.zeit),
      lokal,
      datei: DATEI.test(text(s.datei)) ? text(s.datei) : '',
      groesse: typeof s.groesse === 'number' && s.groesse >= 0 ? s.groesse : 0,
      offsite,
      meldung: text(s.meldung),
    };
  } catch {
    return null;
  }
}

export async function leseSicherungen(verzeichnis: string): Promise<SicherungsUebersicht> {
  const status = await readFile(join(verzeichnis, 'status.json'), 'utf8').then(
    leseStatus,
    () => null,
  );
  const namen = await readdir(verzeichnis).catch(() => [] as string[]);
  const dateien = await Promise.all(
    namen
      .filter((n) => DATEI.test(n))
      .map(async (name) => {
        const s = await stat(join(verzeichnis, name));
        return { name, groesse: s.size, zeit: s.mtime.toISOString() };
      }),
  );
  dateien.sort((a, b) => b.zeit.localeCompare(a.zeit));
  return { status, dateien: dateien.slice(0, 10) };
}
