// Testfälle für .semgrep/sql-injection-pg.yml (`semgrep --test .semgrep`)
declare const pool: { query: (sql: string, values?: unknown[]) => unknown };
declare const name: string;

// ruleid: kirmes-pg-query-template-interpolation
pool.query(`SELECT * FROM ort WHERE name = '${name}'`);

// ruleid: kirmes-pg-query-string-concat
pool.query("SELECT * FROM ort WHERE name = '" + name + "'");

// ok: kirmes-pg-query-template-interpolation
pool.query(`SELECT * FROM ort WHERE name = $1`, [name]);

// ok: kirmes-pg-query-string-concat
pool.query('SELECT * FROM ort WHERE name = $1', [name]);
