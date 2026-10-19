const bcrypt = require('bcryptjs');
const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { generateUsername, nextMembershipNumber, tempPassword } = require('../utils/helpers');
const { canManageAccount } = require('../utils/adminRules');

// Suspending, dismissing or bringing back an ordinary member is the members' decision,
// made by a vote (see controllers/memberCaseController.js). It cannot be done from here.
const VOTE_MESSAGE =
  'Suspending, dismissing or bringing back a member is decided by a vote of the members. Open a vote on the Votes page.';

// The System Administrator's account lives in the administrator area. The
// chairperson's office screens never touch it, so the two responsibilities stay
// apart and one office cannot seize the other's account.
const SYSTEM_ADMIN_MESSAGE = 'The System Administrator account is managed from the administrator area and cannot be changed here.';

/** Refuse the office screens' reach over an account they may not touch. */
function refuseAccount(req, res, targetId, targetRole, newRole) {
  const verdict = canManageAccount({ actorId: req.user.id, targetId, targetRole, newRole });
  if (verdict.ok) return false;
  res.status(403).json({
    message: verdict.reason === 'own_role'
      ? 'You cannot change your own role.'
      : SYSTEM_ADMIN_MESSAGE,
  });
  return true;
}

// GET /api/users
const listUsers = wrap(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.role, u.full_name, u.phone, u.language, u.is_active,
            u.last_login, u.created_at, u.locked_until,
            m.id AS member_id, m.membership_number, to_char(m.date_joined,'YYYY-MM-DD') AS date_joined,
            m.status AS member_status, m.village, m.address,
            m.next_of_kin, m.next_of_kin_phone, m.gender, m.marital_status, m.date_of_birth, m.occupation,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      ORDER BY
        CASE u.role WHEN 'admin' THEN 1 WHEN 'treasurer' THEN 2 WHEN 'secretary' THEN 3 ELSE 4 END,
        u.full_name`
  );
  res.json(rows);
});

// POST /api/users  — the admin adds a member to the group
const createUser = wrap(async (req, res) => {
  const { full_name, phone, language = 'ny', village, address,
          next_of_kin, next_of_kin_phone, gender, marital_status, date_of_birth, occupation,
          username: wantedUsername, password: wantedPassword } = req.body;

  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ message: 'Enter their full name.' });
  }
  // Everyone added here joins as an ordinary member. The offices are won by a
  // vote of the members and the system administrator is appointed in her own
  // area, so this page never hands out standing.
  const role = 'member';
  if (req.body.role && req.body.role !== 'member') {
    return res.status(400).json({ message: 'Officers are chosen by a vote of the members, not added from this page.' });
  }

  let username = String(wantedUsername || '').trim().toLowerCase();
  if (username) {
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ message: 'A username is 3–20 letters, numbers or underscores, no spaces.' });
    }
    const taken = await one(`SELECT id FROM users WHERE username = $1`, [username]);
    if (taken) return res.status(409).json({ message: 'That username is already taken. Try another.' });
  } else {
    username = await generateUsername(full_name);
  }

  const plainPassword = wantedPassword && String(wantedPassword).length >= 6
    ? String(wantedPassword)
    : tempPassword();
  const hashed = await bcrypt.hash(plainPassword, 10);

  const created = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, password, role, full_name, phone, language, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       RETURNING id, username, role, full_name, phone, language`,
      [username, hashed, role, String(full_name).trim(), phone || null, language === 'en' ? 'en' : 'ny']
    );
    const user = rows[0];

    // Everyone in the group is also a member — the committee saves too.
    const membershipNumber = await nextMembershipNumber();
    const memberRes = await client.query(
      `INSERT INTO members (user_id, membership_number, village, address, next_of_kin, next_of_kin_phone,
                            gender, marital_status, date_of_birth, occupation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, membership_number`,
      [user.id, membershipNumber, village || null, address || null, next_of_kin || null, next_of_kin_phone || null,
       gender || null, marital_status || null, date_of_birth || null, occupation || null]
    );

    return { user, member: memberRes.rows[0] };
  });

  await audit(req.user.id, 'CREATE_USER', 'users', created.user.id, `${full_name} as ${role}`);

  let smsResult = { ok: false, error: 'No phone number on file' };
  if (phone) {
    smsResult = await sendSMS(
      phone,
      build('accountCreated', created.user.language, {
        name: created.user.full_name, username, password: plainPassword,
      }),
      { name: created.user.full_name, category: 'account', sentBy: req.user.id }
    );
  }

  res.status(201).json({
    message: `${full_name} has been added.`,
    user: created.user,
    member: created.member,
    // The password is only ever sent to the person by text. It is never
    // returned here, so nobody but them can read it.
    sms_sent: smsResult.ok,
    sms_error: smsResult.ok ? null : smsResult.error,
  });
});

// PATCH /api/users/:id
const updateUser = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, phone, role, language, is_active, village, address, next_of_kin, next_of_kin_phone,
          member_status, gender, marital_status, date_of_birth, occupation } = req.body;

  const existing = await one(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That person is not on the list.' });

  // A role is not a detail that gets edited here. The offices are won by a vote
  // of the members and the system administrator is appointed in her own area, so
  // this page keeps the records without handing out standing.
  if (role && role !== existing.role) {
    return res.status(403).json({ message: 'Roles are given by a vote of the members, not from this page.' });
  }

  // The office screens never reach the System Administrator's account.
  if (refuseAccount(req, res, id, existing.role)) return;

  // The secretary keeps the member register. The office accounts are the
  // chairperson's to keep, so they are not edited from this page by anyone else.
  if (req.user.role !== 'admin' && existing.role !== 'member') {
    return res.status(403).json({ message: 'Only the chairperson maintains the office accounts.' });
  }

  // An ordinary member's standing in the group (active, suspended, dismissed) can only
  // change through a vote. Saving the same value again is fine.
  if (existing.role === 'member') {
    if (typeof is_active === 'boolean' && is_active !== existing.is_active) {
      return res.status(400).json({ message: VOTE_MESSAGE });
    }
    if (member_status) {
      const current = await one(`SELECT status FROM members WHERE user_id = $1`, [id]);
      if (current && current.status !== member_status) {
        return res.status(400).json({ message: VOTE_MESSAGE });
      }
    }
  }

  await query(
    `UPDATE users SET
       full_name = COALESCE($2, full_name),
       phone     = COALESCE($3, phone),
       language  = COALESCE($4, language),
       is_active = COALESCE($5, is_active)
     WHERE id = $1`,
    [id, full_name || null, phone || null, language || null,
     typeof is_active === 'boolean' ? is_active : null]
  );

  await query(
    `UPDATE members SET
       village = COALESCE($2, village),
       address = COALESCE($3, address),
       next_of_kin = COALESCE($4, next_of_kin),
       next_of_kin_phone = COALESCE($5, next_of_kin_phone),
       status = COALESCE($6, status),
       gender = COALESCE($7, gender),
       marital_status = COALESCE($8, marital_status),
       date_of_birth = COALESCE($9, date_of_birth),
       occupation = COALESCE($10, occupation)
     WHERE user_id = $1`,
    [id, village || null, address || null, next_of_kin || null, next_of_kin_phone || null, member_status || null,
     gender || null, marital_status || null, date_of_birth || null, occupation || null]
  );

  await audit(req.user.id, 'UPDATE_USER', 'users', id, full_name || existing.full_name);
  res.json({ message: 'Details saved.' });
});

// POST /api/users/:id/reset-password — admin hands out a new temporary password
const adminResetPassword = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const user = await one(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!user) return res.status(404).json({ message: 'That person is not on the list.' });
  if (refuseAccount(req, res, id, user.role)) return;

  const plain = tempPassword();
  const hashed = await bcrypt.hash(plain, 10);
  await query(
    `UPDATE users SET password = $2, must_change_password = TRUE, failed_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [id, hashed]
  );

  let sms = { ok: false };
  if (user.phone) {
    sms = await sendSMS(
      user.phone,
      build('accountCreated', user.language, { name: user.full_name, username: user.username, password: plain }),
      { name: user.full_name, category: 'account', sentBy: req.user.id }
    );
  }

  await audit(req.user.id, 'ADMIN_RESET_PASSWORD', 'users', id, user.username);
  // The new password is only sent to the person by text, never returned here.
  res.json({
    message: `A new password was created for ${user.full_name} and sent to them by text.`,
    sms_sent: sms.ok,
  });
});

// POST /api/users/:id/unlock — clear a lockout before the 5 minutes are up
const unlockUser = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const user = await one(`SELECT role FROM users WHERE id = $1`, [id]);
  if (!user) return res.status(404).json({ message: 'That person is not on the list.' });
  if (refuseAccount(req, res, id, user.role)) return;

  await query(`UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = $1`, [id]);
  await audit(req.user.id, 'UNLOCK_USER', 'users', id, null);
  res.json({ message: 'Account unlocked.' });
});

// DELETE /api/users/:id — suspend rather than delete, so the books stay intact
const deactivateUser = wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: 'You cannot suspend your own account.' });

  const user = await one(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!user) return res.status(404).json({ message: 'That person is not on the list.' });
  if (refuseAccount(req, res, id, user.role)) return;

  // An ordinary member is suspended or dismissed by a vote of the members, not from here.
  if (user.role === 'member') return res.status(400).json({ message: VOTE_MESSAGE });

  const openLoan = await one(
    `SELECT l.id FROM loans l JOIN members m ON m.id = l.member_id
      WHERE m.user_id = $1 AND l.status IN ('pending','approved') LIMIT 1`,
    [id]
  );
  if (openLoan) return res.status(400).json({ message: 'This member still has an open loan. Settle it first.' });

  await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [id]);
  await query(`UPDATE members SET status = 'inactive' WHERE user_id = $1`, [id]);
  await audit(req.user.id, 'DEACTIVATE_USER', 'users', id, user.full_name);

  res.json({ message: `${user.full_name} has been suspended.` });
});

// POST /api/users/:id/reactivate — the chairperson brings a suspended account back
const reactivateUser = wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: 'You cannot reactivate your own account.' });

  const user = await one(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!user) return res.status(404).json({ message: 'That person is not on the list.' });
  if (refuseAccount(req, res, id, user.role)) return;

  // Like suspension, an ordinary member is brought back by a vote of the members, not from here.
  if (user.role === 'member') return res.status(400).json({ message: VOTE_MESSAGE });

  if (user.is_active) return res.status(400).json({ message: `${user.full_name} is already active.` });

  await query(`UPDATE users SET is_active = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [id]);
  await query(`UPDATE members SET status = 'active' WHERE user_id = $1`, [id]);
  await audit(req.user.id, 'REACTIVATE_USER', 'users', id, user.full_name);

  res.json({ message: `${user.full_name} is back.` });
});

// GET /api/users/history — the membership register's story: who joined, who was
// approved or rejected, and every change of standing. It reads the members'
// joined dates together with the audit trail. Nothing here is ever edited from
// the group floor: a correction is a new entry in the audit trail.
const membershipHistory = wrap(async (req, res) => {
  const events = await query(
    `SELECT * FROM (
       SELECT 'member-' || u.id                AS id,
              u.full_name                      AS member_name,
              'joined'                         AS event_key,
              COALESCE(m.date_joined::timestamptz, u.created_at) AS occurred_at,
              (SELECT au.full_name FROM audit_logs al JOIN users au ON au.id = al.user_id
                WHERE al.action = 'CREATE_USER' AND al.entity_type = 'users' AND al.entity_id = u.id
                LIMIT 1)                       AS performed_by,
              CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END AS status
         FROM users u JOIN members m ON m.user_id = u.id
       UNION ALL
       SELECT 'audit-' || al.id                 AS id,
              COALESCE(
                lu.full_name,
                CASE WHEN al.action = 'EXECUTE_MEMBER_VOTE'
                     THEN regexp_replace(al.details, '^[a-z]+ ', '') ELSE al.details END
              )                                  AS member_name,
              CASE al.action
                WHEN 'APPROVE_JOIN_REQUEST' THEN 'approved'
                WHEN 'REJECT_JOIN_REQUEST'  THEN 'rejected'
                WHEN 'DEACTIVATE_USER'      THEN 'deactivated'
                WHEN 'REACTIVATE_USER'      THEN 'reactivated'
                WHEN 'EXECUTE_MEMBER_VOTE'  THEN 'status_changed'
                WHEN 'UPDATE_USER'          THEN 'record_updated'
                WHEN 'UNLOCK_USER'          THEN 'unlocked'
                ELSE 'membership_event' END  AS event_key,
              al.created_at                      AS occurred_at,
              au.full_name                       AS performed_by,
              CASE
                WHEN al.action = 'APPROVE_JOIN_REQUEST' THEN 'approved'
                WHEN al.action = 'REJECT_JOIN_REQUEST'  THEN 'rejected'
                WHEN al.action = 'DEACTIVATE_USER'      THEN 'inactive'
                WHEN al.action = 'REACTIVATE_USER'      THEN 'active'
                WHEN al.action = 'EXECUTE_MEMBER_VOTE' AND al.details ILIKE 'suspend%' THEN 'inactive'
                WHEN al.action = 'EXECUTE_MEMBER_VOTE' AND al.details ILIKE 'dismiss%' THEN 'inactive'
                WHEN al.action = 'EXECUTE_MEMBER_VOTE'  THEN 'active'
                ELSE NULL END                    AS status
         FROM audit_logs al
         LEFT JOIN users au ON au.id = al.user_id
         LEFT JOIN users lu ON lu.id = al.entity_id AND al.entity_type = 'users'
        WHERE al.action IN ('APPROVE_JOIN_REQUEST', 'REJECT_JOIN_REQUEST', 'DEACTIVATE_USER',
                            'REACTIVATE_USER', 'EXECUTE_MEMBER_VOTE', 'UPDATE_USER', 'UNLOCK_USER')
     ) events
     ORDER BY events.occurred_at DESC, events.id DESC
     LIMIT 200`
  );
  res.json({ events });
});

module.exports = { listUsers, createUser, updateUser, adminResetPassword, unlockUser, deactivateUser, reactivateUser, membershipHistory };