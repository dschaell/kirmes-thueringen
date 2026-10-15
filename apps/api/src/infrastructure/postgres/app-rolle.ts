/**
 * Login-Rolle der API (Least Privilege): Mitglied von „kirmes_app_rechte“ (Migration 009) – darf
 * Daten lesen und schreiben, aber kein DDL. Das Passwort kommt aus der Umgebung, nie aus dem Repo.
 */
import type pg from 'pg';

export const APP_ROLLE = 'kirmes_app';

/*
 * CREATE/ALTER ROLE kennen keine Bind-Parameter. Deshalb baut der SERVER die Anweisung mit
 * format(%I, %L) – Name und Passwort werden dort korrekt als Bezeichner bzw. Literal quotiert.
 * Hier wird kein SQL aus Eingaben zusammengesetzt.
 */
const SQL_ROLLE_ANWEISUNG = `
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
       THEN 'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L'
       ELSE 'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L' END,
  $1::text, $2::text) AS anweisung`;
const SQL_MITGLIEDSCHAFT = `SELECT format('GRANT kirmes_app_rechte TO %I', $1::text) AS anweisung`;

export async function richteAppLoginEin(
  db: Pick<pg.ClientBase, 'query'>,
  passwort: string,
  rolle = APP_ROLLE,
): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(rolle)) throw new Error(`Ungültiger Rollenname „${rolle}“`);
  if (passwort.length < 16) throw new Error('APP_DB_PASSWORD muss mindestens 16 Zeichen haben');
  const schritte: [string, string[]][] = [
    [SQL_ROLLE_ANWEISUNG, [rolle, passwort]],
    [SQL_MITGLIEDSCHAFT, [rolle]],
  ];
  for (const [sql, werte] of schritte) {
    const { rows } = await db.query<{ anweisung: string }>(sql, werte);
    const anweisung = rows[0]?.anweisung;
    if (!anweisung) throw new Error('Rollen-Anweisung konnte nicht erzeugt werden');
    await db.query(anweisung);
  }
}
