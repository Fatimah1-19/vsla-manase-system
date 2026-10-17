const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, one } = require('../config/db');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getSetting } = require('../utils/helpers');
const { wrap } = require('../middleware/errorHandler');

// The administrator sets the security numbers on the System settings page. The
// environment values are only the fallback used before the table is filled in.
const RESET_MINUTES = 10;
const envInt = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

async function num(key, fallback) {
  const v = await getSetting(key, null);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const maxAttempts = () => num('max_login_attempts', envInt(process.env.MAX_LOGIN_ATTEMPTS, 3));
const lockMinutes = () => num('lock_minutes', envInt(process.env.LOCK_MINUTES, 5));
const resetMaxTries = () => num('reset_max_tries', 3);
const sessionTimeout = () => num('session_timeout_minutes', 10);
const smsEnabled = async () => String(await getSetting('sms_enabled', 'true')).toLowerCase() !== 'false';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
  );
}

function publicUser(user, memberId = null) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    phone: user.phone,
    language: user.language,
    must_change_password: user.must_change_password,
    member_id: memberId,
    has_avatar: !!user.has_avatar,
  };
}

// POST /api/auth/login
const login = wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: 'Enter your username and password.' });
  }

  const user = await one(`SELECT * FROM users WHERE LOWER(username) = $1`, [username]);

  // Same reply whether the username exists or not, so nobody can fish for names.
  if (!user) {
    return res.status(401).json({ message: 'That username and password do not match.' });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const secondsLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
    return res.status(423).json({
      message: `Too many wrong passwords. Try again in ${Math.ceil(secondsLeft / 60)} minute(s).`,
      locked: true,
      seconds_remaining: secondsLeft,
    });
  }

  if (!user.is_active) {
    return res.status(403).json({ message: 'This account has been suspended. Talk to the chairperson.' });
  }

  const match = await bcrypt.compare(password, user.password);
  const MAX_ATTEMPTS = await maxAttempts();
  const LOCK_MINUTES = await lockMinutes();

  if (!match) {
    const attempts = user.failed_attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      await query(
        `UPDATE users SET failed_attempts = 0, locked_until = NOW() + ($2 || ' minutes')::interval WHERE id = $1`,
        [user.id, String(LOCK_MINUTES)]
      );
      await audit(user.id, 'LOGIN_LOCKED', 'users', user.id, `Locked for ${LOCK_MINUTES} minutes`);
      return res.status(423).json({
        message: `That is ${MAX_ATTEMPTS} wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.`,
        locked: true,
        seconds_remaining: LOCK_MINUTES * 60,
      });
    }

    await query(`UPDATE users SET failed_attempts = $2 WHERE id = $1`, [user.id, attempts]);
    return res.status(401).json({
      message: 'That username and password do not match.',
      attempts_remaining: MAX_ATTEMPTS - attempts,
    });
  }

  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
    [user.id]
  );

  const member = await one(`SELECT id, (avatar IS NOT NULL) AS has_avatar FROM members WHERE user_id = $1`, [user.id]);
  await audit(user.id, 'LOGIN', 'users', user.id, null);

  user.has_avatar = member && member.has_avatar;

  res.json({
    message: 'Logged in.',
    token: signToken(user),
    user: publicUser(user, member ? member.id : null),
    session_timeout_minutes: await sessionTimeout(),
  });
});

// GET /api/auth/me
const me = wrap(async (req, res) => {
  res.json({ user: req.user, session_timeout_minutes: await sessionTimeout() });
});

// POST /api/auth/forgot  { username }  -> texts a 6-digit code
const forgotPassword = wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ message: 'Enter your username.' });

  const user = await one(`SELECT * FROM users WHERE LOWER(username) = $1`, [username]);

  // Always answer the same way so nobody learns which usernames exist.
  const generic = {
    message: 'If that username exists, a code has been sent to the phone on the account.',
  };

  if (!user || !user.phone) return res.json(generic);

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 10);

  await query(`UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [user.id]);
  await query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [user.id, codeHash, String(RESET_MINUTES)]
  );

  if (await smsEnabled()) {
    await sendSMS(user.phone, build('passwordResetCode', user.language, { code, minutes: RESET_MINUTES }), {
      name: user.full_name,
      category: 'password_reset',
    });
  }

  await audit(user.id, 'PASSWORD_RESET_REQUESTED', 'users', user.id, null);

  // Masked hint so she knows which phone to check.
  const masked = user.phone.replace(/.(?=.{3})/g, '*');
  res.json({ ...generic, phone_hint: masked, expires_in_minutes: RESET_MINUTES });
});

// POST /api/auth/reset  { username, code, new_password }
const resetPassword = wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.new_password || '');

  if (!username || !code || !newPassword) {
    return res.status(400).json({ message: 'Enter your username, the code you were sent, and a new password.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'The new password needs at least 6 characters.' });
  }

  const user = await one(`SELECT * FROM users WHERE LOWER(username) = $1`, [username]);
  if (!user) return res.status(400).json({ message: 'That code is wrong or has expired.' });

  const reset = await one(
    `SELECT * FROM password_resets
      WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  if (!reset) return res.status(400).json({ message: 'That code is wrong or has expired. Ask for a new one.' });

  const MAX_TRIES = await resetMaxTries();
  if (reset.attempts >= MAX_TRIES) {
    await query(`UPDATE password_resets SET used = TRUE WHERE id = $1`, [reset.id]);
    await audit(user.id, 'PASSWORD_RESET_BLOCKED', 'users', user.id, `After ${MAX_TRIES} wrong codes`);
    return res.status(429).json({ message: 'Too many wrong codes. Ask for a new code.' });
  }

  const codeOk = await bcrypt.compare(code, reset.code_hash);
  if (!codeOk) {
    await query(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1`, [reset.id]);
    await audit(user.id, 'PASSWORD_RESET_FAILED', 'users', user.id, `Try ${reset.attempts + 1} of ${MAX_TRIES}`);
    return res.status(400).json({
      message: 'That code is wrong.',
      attempts_remaining: Math.max(MAX_TRIES - reset.attempts - 1, 0),
    });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE users
        SET password = $2, failed_attempts = 0, locked_until = NULL, must_change_password = FALSE
      WHERE id = $1`,
    [user.id, hashed]
  );
  await query(`UPDATE password_resets SET used = TRUE WHERE id = $1`, [reset.id]);

  await sendSMS(user.phone, build('passwordChanged', user.language, { name: user.full_name }), {
    name: user.full_name, category: 'password_reset',
  });
  await audit(user.id, 'PASSWORD_RESET', 'users', user.id, null);

  res.json({ message: 'Password changed. You can log in now.' });
});

// POST /api/auth/change-password  (logged in)
const changePassword = wrap(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'Enter your current password and the new one.' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ message: 'The new password needs at least 6 characters.' });
  }

  const user = await one(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
  const match = await bcrypt.compare(current_password, user.password);
  if (!match) return res.status(400).json({ message: 'Your current password is not correct.' });

  const hashed = await bcrypt.hash(new_password, 10);
  await query(`UPDATE users SET password = $2, must_change_password = FALSE WHERE id = $1`, [user.id, hashed]);

  await sendSMS(user.phone, build('passwordChanged', user.language, { name: user.full_name }), {
    name: user.full_name, category: 'password_reset',
  });
  await audit(user.id, 'PASSWORD_CHANGED', 'users', user.id, null);

  res.json({ message: 'Password changed.' });
});

// PATCH /api/auth/language  { language: 'en' | 'ny' }
const setLanguage = wrap(async (req, res) => {
  const language = req.body.language === 'en' ? 'en' : 'ny';
  await query(`UPDATE users SET language = $2 WHERE id = $1`, [req.user.id, language]);
  res.json({ message: 'Language saved.', language });
});

// POST /api/auth/logout — the browser tells us when someone is leaving, so the
// log can show the end of each sitting.
const logout = wrap(async (req, res) => {
  await audit(req.user.id, 'LOGOUT', 'users', req.user.id, null);
  res.json({ message: 'Signed out.' });
});

module.exports = { login, me, logout, forgotPassword, resetPassword, changePassword, setLanguage };
