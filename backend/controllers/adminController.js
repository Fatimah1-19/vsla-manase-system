const bcrypt = require('bcryptjs');
const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { generateUsername, nextMembershipNumber, tempPassword } = require('../utils/helpers');
const { canDecideChange, canRemoveAdministrator, canSetSystemRole } = require('../utils/adminRules');
const { applyGroupRules } = require('./settingsController');
const { ROLES, OFFICES, PERMISSIONS } = require('../config/permissions');

// The fields the administrator may ask to change on an account. Never the role:
// an office is won by a vote of the members, not handed out from here.
const EDITABLE = ['full_name', 'phone', 'language', 'village'];
const KINDS = ['update_user', 'deactivate_user', 'reactivate_user'];

async function activeAdministrators() {
  return (await one(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'system_admin' AND is_active = TRUE`)).c;
}

// GET /api/admin/members — the account list, with no money on it
const listMembers = wrap(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.role, u.full_name, u.phone, u.language, u.is_active,
            u.last_login, u.created_at, u.locked_until,
            m.membership_number, m.status AS member_status, m.village,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      ORDER BY
        CASE u.role WHEN 'admin' THEN 1 WHEN 'treasurer' THEN 2 WHEN 'secretary' THEN 3
                    WHEN 'system_admin' THEN 4 ELSE 5 END,
        u.full_name`
  );
  res.json(rows);
});

// POST /api/admin/accounts — the administrator opens an account for a new member
const createAccount = wrap(async (req, res) => {
  const { full_name, phone, language = 'ny', village } = req.body || {};

  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ message: 'Enter their full name.' });
  }

  const username = await generateUsername(full_name);
  const plain = tempPassword();
  const hashed = await bcrypt.hash(plain, 10);

  const created = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, password, role, full_name, phone, language, must_change_password)
       VALUES ($1,$2,'member',$3,$4,$5,TRUE)
       RETURNING id, username, role, full_name, phone, language`,
      [username, hashed, String(full_name).trim(), phone || null, language === 'en' ? 'en' : 'ny']
    );
    const user = rows[0];
    const membershipNumber = await nextMembershipNumber();
    const memberRes = await client.query(
      `INSERT INTO members (user_id, membership_number, village) VALUES ($1,$2,$3)
       RETURNING id, membership_number`,
      [user.id, membershipNumber, village || null]
    );
    return { user, member: memberRes.rows[0] };
  });

  const { user, member } = created;

  await audit(req.user.id, 'CREATE_USER', 'users', user.id, `${full_name} as member`);

  let smsResult = { ok: false, error: 'No phone number on file' };
  if (phone) {
    smsResult = await sendSMS(
      phone,
      build('accountCreated', user.language, { name: user.full_name, username: user.username, password: plain }),
      { name: user.full_name, category: 'account', sentBy: req.user.id }
    );
  }

  res.status(201).json({
    message: `${full_name} has been added.`,
    user,
    member,
    // The password was sent to them by text and is never returned here.
    sms_sent: smsResult.ok,
    sms_error: smsResult.ok ? null : smsResult.error,
  });
});

// GET /api/admin/change-requests — what the administrator has asked for
const listMyChangeRequests = wrap(async (req, res) => {
  const rows = await query(
    `SELECT cr.id, cr.kind, cr.status, cr.payload, cr.reason, cr.created_at, cr.decided_at,
            cr.target_user_id, t.full_name AS target_name, d.full_name AS decided_by_name
       FROM change_requests cr
       LEFT JOIN users t ON t.id = cr.target_user_id
       LEFT JOIN users d ON d.id = cr.decided_by
      WHERE cr.requested_by = $1
      ORDER BY cr.created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/admin/change-requests — ask the chairperson to confirm a change
const proposeChange = wrap(async (req, res) => {
  const { kind, target_user_id, payload = {}, reason } = req.body || {};

  if (!KINDS.includes(kind)) return res.status(400).json({ message: 'Choose what to change.' });
  const targetId = Number(target_user_id);
  if (!targetId) return res.status(400).json({ message: 'Choose the account.' });
  if (targetId === req.user.id) return res.status(400).json({ message: 'You cannot change your own account here.' });

  const target = await one(`SELECT id, full_name, role, is_active FROM users WHERE id = $1`, [targetId]);
  if (!target) return res.status(404).json({ message: 'That account does not exist.' });

  let clean = {};
  if (kind === 'update_user') {
    for (const key of EDITABLE) {
      if (payload[key] !== undefined && String(payload[key]).trim() !== '') clean[key] = String(payload[key]).trim();
    }
    if (!Object.keys(clean).length) return res.status(400).json({ message: 'There is nothing to change.' });
    if (clean.language && !['en', 'ny'].includes(clean.language)) clean.language = 'ny';
  }

  if (kind === 'deactivate_user') {
    if (!target.is_active) return res.status(400).json({ message: 'That account is already suspended.' });
    const removable = canRemoveAdministrator({
      targetIsAdmin: target.role === 'system_admin',
      activeAdministrators: await activeAdministrators(),
    });
    if (!removable.ok) {
      return res.status(400).json({ message: 'This is the only active administrator. Keep at least one.' });
    }
    const openLoan = await one(
      `SELECT l.id FROM loans l JOIN members m ON m.id = l.member_id
        WHERE m.user_id = $1 AND l.status IN ('pending','approved') LIMIT 1`,
      [targetId]
    );
    if (openLoan) return res.status(400).json({ message: 'That member still has an open loan. It must be settled first.' });
  }

  if (kind === 'reactivate_user' && target.is_active) {
    return res.status(400).json({ message: 'That account is already active.' });
  }

  const waiting = await one(
    `SELECT id FROM change_requests WHERE target_user_id = $1 AND status = 'pending' LIMIT 1`, [targetId]
  );
  if (waiting) return res.status(409).json({ message: 'A change to that account is already waiting for the chairperson.' });

  const row = (await query(
    `INSERT INTO change_requests (kind, requested_by, approver_role, target_user_id, payload, reason)
     VALUES ($1, $2, 'admin', $3, $4, $5) RETURNING id`,
    [kind, req.user.id, targetId, JSON.stringify(clean), String(reason || '').trim() || null]
  ))[0];

  await audit(req.user.id, 'PROPOSE_ACCOUNT_CHANGE', 'change_requests', row.id, `${kind} ${target.full_name}`);
  res.status(201).json({ message: 'Sent to the chairperson to confirm.', id: row.id });
});

// POST /api/admin/change-requests/:id/withdraw
const withdrawChangeRequest = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await one(`SELECT * FROM change_requests WHERE id = $1`, [id]);
  if (!row) return res.status(404).json({ message: 'That request does not exist.' });
  if (row.requested_by !== req.user.id) return res.status(403).json({ message: 'That is not your request.' });
  if (row.status !== 'pending') return res.status(400).json({ message: 'That request has already been decided.' });

  await query(`UPDATE change_requests SET status = 'withdrawn', decided_at = NOW() WHERE id = $1`, [id]);
  await audit(req.user.id, 'WITHDRAW_CHANGE_REQUEST', 'change_requests', id, null);
  res.json({ message: 'Request withdrawn.' });
});

// GET /api/approvals — what is waiting for the chairperson or treasurer
const listPending = wrap(async (req, res) => {
  const role = req.user.role;
  const args = [role];
  const pending = await query(
    `SELECT cr.id, cr.kind, cr.status, cr.payload, cr.reason, cr.created_at, cr.target_user_id,
            r.full_name AS requested_by_name, t.full_name AS target_name
       FROM change_requests cr
       LEFT JOIN users r ON r.id = cr.requested_by
       LEFT JOIN users t ON t.id = cr.target_user_id
      WHERE cr.approver_role = $1 AND cr.status = 'pending'
      ORDER BY cr.created_at DESC`,
    args
  );
  const history = await query(
    `SELECT cr.id, cr.kind, cr.status, cr.decided_at, cr.target_user_id,
            r.full_name AS requested_by_name, t.full_name AS target_name, d.full_name AS decided_by_name
       FROM change_requests cr
       LEFT JOIN users r ON r.id = cr.requested_by
       LEFT JOIN users t ON t.id = cr.target_user_id
       LEFT JOIN users d ON d.id = cr.decided_by
      WHERE cr.approver_role = $1 AND cr.status <> 'pending'
      ORDER BY cr.decided_at DESC NULLS LAST LIMIT 30`,
    args
  );
  res.json({ pending, history });
});

// POST /api/approvals/:id/decide  { decision: 'approve' | 'reject' }
const decideChangeRequest = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body && req.body.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ message: 'Choose approve or reject.' });
  }

  const cr = await one(`SELECT * FROM change_requests WHERE id = $1`, [id]);
  if (!cr) return res.status(404).json({ message: 'That request does not exist.' });

  const verdict = canDecideChange({
    status: cr.status,
    approverRoleRequired: cr.approver_role,
    approverRole: req.user.role,
    requestedById: cr.requested_by,
    approverId: req.user.id,
  });
  if (!verdict.ok) {
    if (verdict.reason === 'already_decided') return res.status(400).json({ message: 'That request was already decided.' });
    if (verdict.reason === 'wrong_role') return res.status(403).json({ message: 'This request is not yours to confirm.' });
    return res.status(400).json({ message: 'You cannot confirm your own request.' });
  }

  if (decision === 'reject') {
    await query(
      `UPDATE change_requests SET status = 'rejected', decided_by = $2, decided_at = NOW() WHERE id = $1`,
      [id, req.user.id]
    );
    await audit(req.user.id, 'REJECT_CHANGE_REQUEST', 'change_requests', id, cr.kind);
    return res.json({ message: 'Request rejected.' });
  }

  const payload = cr.payload || {};
  const targetId = cr.target_user_id;

  if (cr.kind === 'group_rules') {
    await applyGroupRules(payload, req.user.id);
  } else {
    const target = await one(`SELECT id, full_name, role, is_active FROM users WHERE id = $1`, [targetId]);
    if (!target) {
      await query(`UPDATE change_requests SET status = 'rejected', decided_by = $2, decided_at = NOW() WHERE id = $1`, [id, req.user.id]);
      return res.status(400).json({ message: 'That account no longer exists.' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ message: 'You cannot confirm a change to your own account.' });
    }

    if (cr.kind === 'update_user') {
      await query(
        `UPDATE users SET full_name = COALESCE($2, full_name), phone = COALESCE($3, phone),
                          language = COALESCE($4, language)
          WHERE id = $1`,
        [targetId, payload.full_name || null, payload.phone || null, payload.language || null]
      );
      if (payload.village) {
        await query(`UPDATE members SET village = $2 WHERE user_id = $1`, [targetId, payload.village]);
      }
    } else if (cr.kind === 'deactivate_user') {
      const removable = canRemoveAdministrator({
        targetIsAdmin: target.role === 'system_admin',
        activeAdministrators: await activeAdministrators(),
      });
      if (!removable.ok) {
        return res.status(400).json({ message: 'This is the only active administrator. Keep at least one.' });
      }
      await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [targetId]);
      await query(`UPDATE members SET status = 'inactive' WHERE user_id = $1`, [targetId]);
    } else if (cr.kind === 'reactivate_user') {
      await query(`UPDATE users SET is_active = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [targetId]);
      await query(`UPDATE members SET status = 'active' WHERE user_id = $1`, [targetId]);
    }
  }

  await query(
    `UPDATE change_requests SET status = 'approved', decided_by = $2, decided_at = NOW() WHERE id = $1`,
    [id, req.user.id]
  );
  await audit(req.user.id, 'APPROVE_CHANGE_REQUEST', 'change_requests', id, cr.kind);
  res.json({ message: 'Change confirmed.' });
});

// GET /api/admin/config-changes — VSLA settings the administrator has proposed,
// waiting for the chairperson, together with what was already decided.
const listConfigChanges = wrap(async (req, res) => {
  const rows = await query(
    `SELECT cr.id, cr.kind, cr.status, cr.payload, cr.reason, cr.created_at, cr.decided_at,
            r.full_name AS requested_by_name, d.full_name AS decided_by_name
       FROM change_requests cr
       LEFT JOIN users r ON r.id = cr.requested_by
       LEFT JOIN users d ON d.id = cr.decided_by
      WHERE cr.kind = 'group_rules'
      ORDER BY (cr.status = 'pending') DESC, cr.created_at DESC LIMIT 50`
  );
  res.json(rows);
});

// GET /api/admin/permissions — who may do what, straight from the one file that
// holds every rule. The administrator reads it; she never edits it from here.
const listPermissions = wrap(async (req, res) => {
  const permissions = Object.entries(PERMISSIONS).map(([key, roles]) => ({ key, roles }));
  res.json({ roles: ROLES, offices: OFFICES, permissions });
});

// PATCH /api/admin/accounts/:id/role  { system_admin: true | false }
// The one role the administrator may hand out or take back. Group offices
// (chairperson, treasurer, secretary) are never set here: the members elect them.
const setSystemRole = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const makeAdmin = !!req.body?.system_admin;
  if (!id) return res.status(400).json({ message: 'Choose the account.' });
  if (id === req.user.id) return res.status(400).json({ message: 'You cannot change your own role here.' });

  const target = await one(`SELECT id, full_name, role, is_active FROM users WHERE id = $1`, [id]);
  if (!target) return res.status(404).json({ message: 'That account does not exist.' });

  const verdict = canSetSystemRole({
    targetRole: target.role,
    makeAdmin,
    activeAdministrators: await activeAdministrators(),
  });
  if (!verdict.ok) {
    const messages = {
      is_office: 'The committee posts are decided by a vote of the members, not from here.',
      already_admin: 'That account is already an administrator.',
      not_admin: 'That account is not a system administrator.',
      last_admin: 'This is the only administrator. Keep at least one.',
    };
    return res.status(400).json({ message: messages[verdict.reason] || 'That change cannot be made.' });
  }

  const role = makeAdmin ? 'system_admin' : 'member';
  await query(`UPDATE users SET role = $2 WHERE id = $1`, [target.id, role]);

  // An administrator is a member like everyone else, so she must have a member row.
  if (makeAdmin) {
    await query(
      `INSERT INTO members (user_id, membership_number, village)
       SELECT $1, 'VB-' || LPAD(COALESCE((SELECT MAX(CAST(SUBSTRING(membership_number FROM 4) AS INT)) FROM members), 0) + 1, 4, '0'), NULL
       WHERE NOT EXISTS (SELECT 1 FROM members WHERE user_id = $1)`,
      [target.id]
    );
  }

  await audit(req.user.id, makeAdmin ? 'GRANT_SYSTEM_ADMIN' : 'REVOKE_SYSTEM_ADMIN', 'users', id, target.full_name);
  res.json({
    message: makeAdmin
      ? `${target.full_name} is now a system administrator.`
      : `${target.full_name} is no longer a system administrator.`,
  });
});

module.exports = {
  listMembers, createAccount, listMyChangeRequests, proposeChange, withdrawChangeRequest,
  listPending, decideChangeRequest, listConfigChanges, listPermissions, setSystemRole,
};
