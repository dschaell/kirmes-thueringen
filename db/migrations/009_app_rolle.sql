-- Least Privilege: Die API arbeitet mit einer Rolle ohne DDL-Rechte. Diese Migration legt nur die
-- Rechte-Gruppe an (ohne Login, ohne Passwort). Den Login „kirmes_app“ mit Passwort aus der Umgebung
-- (APP_DB_PASSWORD) richtet der Migrationslauf ein – Passwörter stehen nie im Repository.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kirmes_app_rechte') THEN
    CREATE ROLE kirmes_app_rechte NOLOGIN;
  END IF;
END
$$;

-- Niemand außer den berechtigten Rollen sieht das Schema
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO kirmes_app_rechte;

-- Daten lesen und schreiben – aber keine Tabellen anlegen, ändern oder löschen
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kirmes_app_rechte;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kirmes_app_rechte;
-- Stammdaten und Migrationsbuch nur lesen bzw. gar nicht
REVOKE INSERT, UPDATE, DELETE ON landkreis FROM kirmes_app_rechte;
REVOKE ALL ON schema_migration FROM kirmes_app_rechte;
REVOKE INSERT, UPDATE, DELETE ON spatial_ref_sys FROM kirmes_app_rechte;

-- Künftige Tabellen der Migrationen erhalten dieselben Rechte automatisch
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kirmes_app_rechte;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kirmes_app_rechte;
