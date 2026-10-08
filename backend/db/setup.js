// Creates every table in your Neon database.  Run:  npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

(async () => {
  const force = process.argv.includes('--force');

  try {
    if (force) {
      console.log('Dropping existing tables...');
      await pool.query(`
        DROP TABLE IF EXISTS member_documents, monthly_contributions, share_out_details, share_out, join_request_votes, join_requests,
          attendance, meetings, welfare_fund, fines, loan_repayments, loans, savings,
          password_resets, sms_notifications, audit_logs, settings, members, cycles, users CASCADE;
      `);
    }

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`\nDatabase ready. ${rows.length} tables:`);
    console.log(rows.map((r) => '  - ' + r.table_name).join('\n'));
    console.log('\nNow run:  npm run db:seed\n');
  } catch (err) {
    // Some connection failures arrive with an empty message and the real
    // reasons tucked inside err.errors, so print everything we can find.
    const reasons = [err, ...(err.errors || [])];
    console.error('\nSetup failed.');
    for (const r of reasons) {
      const bits = [r.code, r.message, r.address && `${r.address}:${r.port}`].filter(Boolean);
      console.error('  - ' + (bits.join('  ') || String(r)));
    }
    const codes = reasons.map((r) => r.code);
    if (!process.env.DATABASE_URL) {
      console.error('\nDATABASE_URL is empty. Make sure backend/.env exists and has DATABASE_URL=...\n');
    } else if (codes.some((c) => ['ENOTFOUND', 'EAI_AGAIN'].includes(c))) {
      console.error('\nThe database address could not be found. Check the host name in DATABASE_URL and your internet.\n');
    } else if (codes.some((c) => ['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'].includes(c)) || !err.message) {
      console.error('\nCould not reach the database. Check that the internet is on, that the Neon project is running,');
      console.error('and that DATABASE_URL is the full connection string copied from the Neon dashboard.\n');
    } else if (String(err.message).includes('password authentication')) {
      console.error('\nThe password in DATABASE_URL is wrong or was reset. Copy a fresh connection string from Neon.\n');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
