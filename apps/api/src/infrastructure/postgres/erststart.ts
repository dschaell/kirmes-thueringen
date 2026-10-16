/**
 * Erststart ohne Server-Shell (Issue #42): Auf dem Server deployt ein GitOps-Agent, niemand führt
 * dort CLIs aus. Deshalb kann „migrate“ das Ortsverzeichnis laden und den ersten Redaktionszugang
 * aus verschlüsselten Umgebungsvariablen anlegen – beides idempotent.
 */
import { normalisiereOrtsname, parseKoordinate } from '@kirmes/core';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';

type Db = Pick<pg.ClientBase, 'query'>;

// ── Ortsverzeichnis ─────────────────────────────────────────────────────────────────────
export interface OrtEintrag {
  slug: string;
  name: string;
  landkreis: string;
  lat: number;
  lon: number;
}

export const ORTE_DATEI = new URL('../../../../../db/seed/orte.json', import.meta.url);

/** Liest das Ortsverzeichnis; Koordinaten außerhalb Thüringens (oder vertauschte) werden verworfen. */
export async function leseOrtsverzeichnis(
  datei: URL = ORTE_DATEI,
): Promise<{ orte: OrtEintrag[]; verworfen: number }> {
  const alle = JSON.parse(await readFile(datei, 'utf8')) as OrtEintrag[];
  const orte = alle.filter((o) => parseKoordinate(o.lat, o.lon).ok);
  return { orte, verworfen: alle.length - orte.length };
}

const SQL_ORTE = `
INSERT INTO ort (slug, name, landkreis, lage)
SELECT s, n, l, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[]) AS t(s, n, l, lat, lon)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, landkreis = EXCLUDED.landkreis, lage = EXCLUDED.lage
  WHERE ort.herkunft = 'osm' -- von der Redaktion angelegte Orte bleiben unverändert`;

/** Lädt bzw. aktualisiert Orte (nie löschen). Liefert die Zahl eingefügter/aktualisierter Zeilen. */
export async function ladeOrte(db: Db, orte: OrtEintrag[]): Promise<number> {
  const r = await db.query(SQL_ORTE, [
    orte.map((o) => o.slug),
    orte.map((o) => normalisiereOrtsname(o.name)),
    orte.map((o) => o.landkreis),
    orte.map((o) => o.lat),
    orte.map((o) => o.lon),
  ]);
  return r.rowCount ?? 0;
}

// ── Erster Redaktionszugang ─────────────────────────────────────────────────────────────
export interface AdminStart {
  email: string;
  passwortHash: string;
  totpGeheimnis: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+$/;
/**
 * hashePasswort liefert scrypt$N$r$p$salz$hash. In .env-Dateien würde Docker Compose „$…“ als
 * Variable deuten – deshalb steht der Hash in der Umgebung mit „:“ statt „$“.
 */
const SCRYPT_HASH_ENV = /^scrypt:\d+:\d+:\d+:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;
export const hashFuerEnv = (hash: string) => hash.replaceAll('$', ':');
const TOTP = /^[A-Z2-7]{16,64}$/;

/**
 * Liest ADMIN_EMAIL, ADMIN_PASSWORT_HASH und ADMIN_TOTP_GEHEIMNIS. Keine gesetzt → null.
 * Nur ein Teil gesetzt oder ungültig → Fehler (lieber kein Deploy als ein halber Zugang).
 * Klartext-Passwörter werden bewusst nicht angenommen – nur der scrypt-Hash.
 */
export function ladeAdminStart(env: NodeJS.ProcessEnv = process.env): AdminStart | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const passwortHash = env.ADMIN_PASSWORT_HASH?.trim() ?? '';
  const totpGeheimnis = env.ADMIN_TOTP_GEHEIMNIS?.trim().toUpperCase() ?? '';
  const gesetzt = [email, passwortHash, totpGeheimnis].filter(Boolean).length;
  if (gesetzt === 0) return null;
  if (gesetzt < 3) {
    throw new Error(
      'ADMIN_EMAIL, ADMIN_PASSWORT_HASH und ADMIN_TOTP_GEHEIMNIS nur gemeinsam setzen (npm run admin -- startwerte <email>)',
    );
  }
  if (!EMAIL.test(email)) throw new Error('ADMIN_EMAIL ist keine gültige E-Mail-Adresse');
  if (!SCRYPT_HASH_ENV.test(passwortHash)) {
    throw new Error('ADMIN_PASSWORT_HASH ist kein scrypt-Hash (npm run admin -- startwerte)');
  }
  if (!TOTP.test(totpGeheimnis)) throw new Error('ADMIN_TOTP_GEHEIMNIS ist kein Base32-Geheimnis');
  return { email, passwortHash: passwortHash.replaceAll(':', '$'), totpGeheimnis };
}

/**
 * Legt den Zugang nur an, solange es noch GAR KEINEN Admin gibt. Danach ändert ein erneuter Lauf
 * nichts – auch nicht, wenn die Variablen geändert werden (Passwort ändern geht über die Website/CLI).
 */
export async function legeErstenAdminAn(db: Db, a: AdminStart): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO admin (email, passwort_hash, totp_geheimnis)
     SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM admin)
     ON CONFLICT (email) DO NOTHING`,
    [a.email, a.passwortHash, a.totpGeheimnis],
  );
  return (r.rowCount ?? 0) > 0;
}

/** ORTE_LADEN=ja → Ortsverzeichnis beim Migrieren laden (Server). Lokal bleibt es bei npm run db:orte. */
export const sollOrteLaden = (env: NodeJS.ProcessEnv = process.env) =>
  env.ORTE_LADEN?.trim().toLowerCase() === 'ja';
