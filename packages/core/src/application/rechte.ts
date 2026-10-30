/**
 * Rechte an einer Stelle (Issue #198): Wer darf was – und wo? Jede Prüfung der angemeldeten Person
 * läuft über `darf`; Routen, Use Cases und Web fragen nur noch hier nach. Tabelle: docs/architecture
 * (Rechte). Regeln über ANDERE Konten (letzter Admin, Rolle einer Einladung) sind Datenregeln und
 * bleiben bei der Mitgliederverwaltung.
 */
import type { Rolle } from './admin.js';

export type Aktion =
  /** irgendein Bereich der Redaktion (angemeldetes Mitglied) */
  | 'redaktion'
  | 'termine'
  /** „bestätigt“ setzen – nur der Veranstalter selbst (Issue #240) */
  | 'termine.bestaetigen'
  | 'plaetze'
  | 'vorschlaege'
  | 'korrekturen'
  | 'orte.anlegen'
  /** Ortsmitte, Name/Landkreis selbst angelegter Orte (Issue #216) */
  | 'orte.bearbeiten'
  | 'orte.loeschen'
  | 'mitteilungen'
  | 'links'
  | 'import'
  | 'mitglieder'
  | 'sicherungen'
  /** Zugriffszahlen (Issue #311) */
  | 'statistik';

const ALLE: readonly Rolle[] = ['admin', 'redaktion', 'kirmesgesellschaft'];
const MODERATION: readonly Rolle[] = ['admin', 'redaktion'];
const NUR_ADMIN: readonly Rolle[] = ['admin'];
const NUR_KG: readonly Rolle[] = ['kirmesgesellschaft'];

export const RECHTE: Readonly<Record<Aktion, readonly Rolle[]>> = {
  redaktion: ALLE,
  termine: ALLE,
  'termine.bestaetigen': NUR_KG,
  plaetze: ALLE,
  vorschlaege: ALLE,
  korrekturen: ALLE,
  'orte.anlegen': MODERATION,
  'orte.bearbeiten': MODERATION,
  mitteilungen: MODERATION,
  links: MODERATION,
  import: MODERATION,
  'orte.loeschen': NUR_ADMIN,
  mitglieder: NUR_ADMIN,
  sicherungen: NUR_ADMIN,
  statistik: NUR_ADMIN,
};

/** Bereiche, die an einen Ort gebunden sind – die Kirmesgesellschaft nur am eigenen (Issue #180). */
const ORTSGEBUNDEN: ReadonlySet<Aktion> = new Set([
  'termine',
  'termine.bestaetigen',
  'plaetze',
  'vorschlaege',
  'korrekturen',
]);

type Person = { rolle?: Rolle | null; ortSlug?: string | null } | null | undefined;

/** Ist die Person auf einen Ort beschränkt? Dann Listen filtern und Orte prüfen. */
export const nurEigenerOrt = (s: Person) => s?.rolle === 'kirmesgesellschaft';

/** Darf die Person an diesem Ort arbeiten? Redaktion und Admin überall, KG nur am eigenen. */
export const darfOrt = (s: Person, ortSlug: string) =>
  !!s?.rolle && (!nurEigenerOrt(s) || (!!s.ortSlug && s.ortSlug === ortSlug));

/** Darf die Person die Aktion – und, falls angegeben, an diesem Ort? */
export function darf(s: Person, aktion: Aktion, ortSlug?: string): boolean {
  if (!s?.rolle || !RECHTE[aktion].includes(s.rolle)) return false;
  return ortSlug === undefined || !ORTSGEBUNDEN.has(aktion) || darfOrt(s, ortSlug);
}
