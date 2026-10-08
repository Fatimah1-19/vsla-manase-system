const net = require('net');
const { Pool } = require('pg');
require('dotenv').config();
const { forgetUsers } = require('../utils/userCache');

// Node tries each database address for only 250 ms by default. On a slower or
// long-distance connection (the database is far away) every try gets cut off
// and the error looks like ETIMEDOUT. Give each try enough time to finish.
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
  net.setDefaultAutoSelectFamilyAttemptTimeout(Number(process.env.DB_ATTEMPT_TIMEOUT_MS) || 8000);
}

if (!process.env.DATABASE_URL) {
  console.error('\n[db] DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string.\n');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  // Opening a connection to a faraway database takes seconds, so keep the ones
  // we have open for a long time instead of closing them after 30 seconds.
  idleTimeoutMillis: 10 * 60 * 1000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));

let lastUse = Date.now();

// Anything that changes a user or a member empties the "who is logged in" memory.
const CHANGES_USERS = /^\s*(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(users|members)\b/i;

async function query(text, params = []) {
  lastUse = Date.now();
  if (CHANGES_USERS.test(text)) forgetUsers();
  const res = await pool.query(text, params);
  return res.rows;
}

async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

async function tx(fn) {
  lastUse = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    forgetUsers();            // a transaction may have touched users; start fresh
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Open several connections now, so the first people to use the app do not each
 * wait several seconds for a brand-new one.
 */
function warmUp(count = 8) {
  return Promise.all(Array.from({ length: count }, () => pool.query('SELECT 1')))
    .then(() => true)
    .catch(() => false);
}

// While people are using the app, keep the connections warm. Once nobody has used
// it for 15 minutes the pings stop, so the database is free to go to sleep.
const keeper = setInterval(() => {
  if (Date.now() - lastUse < 15 * 60 * 1000) warmUp(4);
}, 4 * 60 * 1000);
keeper.unref();

module.exports = { pool, query, one, tx, warmUp };