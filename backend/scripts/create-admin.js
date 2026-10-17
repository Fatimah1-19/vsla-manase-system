// Make the first system administrator.
//
// A system administrator looks after accounts and the way the system behaves.
// She is not one of the group's offices and never touches the books. Because
// nobody but an administrator may create another administrator, the very first
// one is made here, from the command line, from a member who is already on the
// list and does not hold an office.
//
// Usage:
//   npm run admin:create                 list the members who may be promoted
//   npm run admin:create -- <username>   promote that member and text her a code
//
// She is texted a one-time code and sets her own password with it (the same
// "I have forgotten my password" screen every member uses). Her password is
// never printed here, so it cannot leak into a terminal history.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, one, query } = require('../config/db');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');

const RESET_MINUTES = 10;
const CODE_TRIES = 3;

async function listCandidates() {
  return query(
    `SELECT u.id, u.username, u.full_name, u.role, u.phone
       FROM users u
      WHERE u.role = 'member' AND u.is_active = TRUE
      ORDER BY u.full_name`
  );
}

(async () => {
  const wanted = String(process.argv[2] || '').trim().toLowerCase();

  if (!wanted) {
    const people = await listCandidates();
    console.log('\nMembers who may be made a system administrator:\n');
    if (!people.length) console.log('  (none found — add a member first)');
    for (const p of people) console.log(`  ${p.username.padEnd(14)} ${p.full_name}`);
    console.log('\nRun again with a username, e.g.  npm run admin:create -- maryk\n');
    await pool.end();
    return;
  }

  const user = await one(`SELECT * FROM users WHERE LOWER(username) = $1`, [wanted]);
  if (!user) {
    console.error(`\nNo account has the username "${wanted}". Run with no username to see the list.\n`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (user.role === 'system_admin') {
    console.error(`\n${user.full_name} is already a system administrator. Nothing to do.\n`);
    await pool.end();
    return;
  }

  // An office holder keeps the books; she cannot also be the administrator who
  // watches the accounts. That separation is the whole point of the role.
  if (['admin', 'treasurer', 'secretary'].includes(user.role)) {
    console.error(`\n${user.full_name} holds the office of ${user.role}. A system administrator must not hold an office.\n`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  await query(`UPDATE users SET role = 'system_admin', must_change_password = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id]);

  // A one-time code to set her own password, exactly like a forgotten password.
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 10);
  await query(`UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [user.id]);
  await query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [user.id, codeHash, String(RESET_MINUTES)]
  );

  let smsSent = false;
  if (user.phone) {
    const result = await sendSMS(
      user.phone,
      build('passwordResetCode', user.language, { code, minutes: RESET_MINUTES }),
      { name: user.full_name, category: 'password_reset' }
    );
    smsSent = result.ok;
  }

  await audit(null, 'CREATE_ADMIN', 'users', user.id, `${user.username} promoted to system_admin`);

  console.log(`\n${user.full_name} is now a system administrator.`);
  console.log(`A code to set her password was ${smsSent ? 'texted to ' + user.phone : 'NOT sent (no phone number on file)'}.`);
  if (!smsSent) {
    console.log(`Give her this code yourself: ${code}`);
    console.log(`It can be tried ${CODE_TRIES} times and expires in ${RESET_MINUTES} minutes.`);
  }
  console.log(`She sets her password with "I have forgotten my password" using the username: ${user.username}\n`);

  await pool.end();
})().catch(async (err) => {
  console.error('\nFailed:', err.message);
  if (err.code === '42P01') console.error('Tables are missing. Run: npm run db:setup\n');
  process.exitCode = 1;
  try { await pool.end(); } catch { /* already closing */ }
});
