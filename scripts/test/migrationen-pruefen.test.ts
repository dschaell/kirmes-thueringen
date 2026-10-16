import { describe, expect, it } from 'vitest';
// @ts-expect-error – reines JavaScript-Modul ohne Typen
import { BASIS, pruefeMigration } from '../migrationen-pruefen.mjs';

const neu = `${String(BASIS + 1).padStart(3, '0')}_neu.sql`;
const pruefe = (sql: string, datei = neu) => pruefeMigration(datei, sql) as string[];

describe('Sperre für datenverändernde Migrationen (#59)', () => {
  it('erlaubt Ergänzungen', () => {
    expect(
      pruefe(`
        CREATE TABLE neu (id bigint PRIMARY KEY);
        ALTER TABLE termin ADD COLUMN notiz text NOT NULL DEFAULT '';
        CREATE INDEX x ON termin (datum);
        DROP INDEX IF EXISTS alt_idx;
        ALTER TABLE termin ALTER COLUMN notiz DROP DEFAULT;
        ALTER TABLE termin DROP CONSTRAINT alt_check;
      `),
    ).toEqual([]);
  });

  it.each([
    ['DROP TABLE admin;', 'DROP'],
    ['ALTER TABLE admin DROP COLUMN name;', 'DROP COLUMN'],
    ['DELETE FROM admin WHERE rolle = $$x$$;', 'DELETE'],
    ['TRUNCATE admin_passkey;', 'TRUNCATE'],
    ['UPDATE admin SET rolle = 1;', 'UPDATE'],
    ['ALTER TABLE admin RENAME COLUMN name TO anzeigename;', 'RENAME'],
    ['ALTER TABLE termin ALTER COLUMN titel TYPE varchar(10);', 'Typänderung'],
    ['ALTER TABLE termin ALTER COLUMN band SET NOT NULL;', 'SET NOT NULL'],
    ['drop schema public cascade;', 'DROP'],
  ])('verbietet %s', (sql, grund) => {
    const f = pruefe(sql);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain(grund);
  });

  it('ignoriert Kommentare und Zeichenketten', () => {
    expect(
      pruefe(`
        -- früher: DELETE FROM admin
        /* DROP TABLE x */
        COMMENT ON TABLE termin IS 'UPDATE termin SET x = 1; DROP TABLE y';
      `),
    ).toEqual([]);
  });

  it('erlaubt Datenänderung nur mit Freigabe und lässt alte Migrationen in Ruhe', () => {
    expect(pruefe('-- datenaenderung-freigegeben: #123\nUPDATE ort SET name = name;')).toEqual([]);
    expect(pruefe('DELETE FROM admin;', '010_redaktion_passkey.sql')).toEqual([]);
    expect(pruefe('SELECT 1', 'ohne_nummer.sql')).toEqual([
      'ohne_nummer.sql: Dateiname muss mit einer Nummer beginnen',
    ]);
  });
});
