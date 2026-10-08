// Measures how long the database takes to answer from this computer.
// Run it from the backend folder:   node db/ping.js
const { pool } = require('../config/db');

const ms = (start) => Math.round(Number(process.hrtime.bigint() - start) / 1e6);

(async () => {
  let t = process.hrtime.bigint();
  await pool.query('SELECT 1');   // the first call includes connecting, and waking Neon if it was asleep
  console.log(`First answer (includes connecting): ${ms(t)} ms`);

  const times = [];
  for (let i = 0; i < 10; i++) {
    t = process.hrtime.bigint();
    await pool.query('SELECT 1');
    times.push(ms(t));
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  console.log(`10 questions, one after another: ${avg} ms each on average (fastest ${Math.min(...times)}, slowest ${Math.max(...times)})`);

  // Open 10 connections first, so the next test measures asking and not connecting.
  await Promise.all(Array.from({ length: 10 }, () => pool.query('SELECT 1')));
  t = process.hrtime.bigint();
  await Promise.all(Array.from({ length: 10 }, () => pool.query('SELECT 1')));
  console.log(`10 questions, all at the same time: ${ms(t)} ms in total`);

  console.log(`\nA page that asks 12 questions one after another waits about ${avg * 12} ms for the database alone.`);
  await pool.end();
})().catch((err) => {
  console.error('Could not reach the database:', err.message || err);
  process.exit(1);
});