// Только для локальных тестов: имитирует pg.Pool через psql (пакета pg локально нет).
const { spawnSync } = require('child_process');

const PSQL_ARGS = ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', process.env.TEST_DB || 'dolya', '-At', '-q', '-X', '-v', 'ON_ERROR_STOP=1'];

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? `'${v}'` : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function inline(text, params) {
  return text.replace(/\$(\d+)/g, (_, i) => lit(params[Number(i) - 1]));
}

function run(sql) {
  const r = spawnSync('psql', PSQL_ARGS, { input: sql, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || 'psql error');
  return r.stdout;
}

module.exports = {
  async query(text, params = []) {
    const q = inline(text, params).trim().replace(/;$/, '');
    let sql;
    if (/^select/i.test(q)) sql = `SELECT coalesce(json_agg(t), '[]'::json) FROM (${q}) t;`;
    else if (/returning/i.test(q)) sql = `WITH t AS (${q}) SELECT coalesce(json_agg(t), '[]'::json) FROM t;`;
    else {
      run(q + ';');
      return { rows: [] };
    }
    const out = run(sql).trim();
    return { rows: out ? JSON.parse(out) : [] };
  }
};
