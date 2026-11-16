// Тонкая обёртка над Postgres. В тестах подменяется шимом через PG_SHIM.
let pool;

if (process.env.PG_SHIM) {
  pool = require(process.env.PG_SHIM);
} else {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL не задан');
    process.exit(1);
  }
  pool = new Pool({
    connectionString,
    ssl: /sslmode=require|neon\.tech/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    max: 5
  });
}

async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

module.exports = { query, one, pool };
