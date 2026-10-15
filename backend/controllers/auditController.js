const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');

// GET /api/audit
const listAudit = wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 150, 500);
  const { action, user_id } = req.query;

  const where = [];
  const params = [];
  if (action) { params.push(action); where.push(`a.action = $${params.length}`); }
  if (user_id) { params.push(user_id); where.push(`a.user_id = $${params.length}`); }
  params.push(limit);

  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            u.full_name, u.role
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json(rows);
});

// GET /api/audit/sessions
// One sitting per sign-in: who, when she signed in and out, and everything done
// in between. A sign-in closes any earlier sitting that was never signed out.
const listSessions = wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 1000, 3000);

  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            a.user_id, u.full_name, u.role
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT $1`,
    [limit]
  );

  const sessions = [];
  const open = new Map();   // user_id -> the sitting currently open for her
  const unassigned = [];    // events with no matching sign-in (e.g. work by the system)

  // Rows arrive newest-first; walk them oldest-first so each sitting is built
  // in the order it happened.
  for (const r of [...rows].reverse()) {
    if (r.user_id && r.action === 'LOGIN') {
      const previous = open.get(r.user_id);
      if (previous) previous.open = false;   // signed in again without signing out
      const session = {
        user_id: r.user_id,
        full_name: r.full_name,
        role: r.role,
        login_at: r.created_at,
        logout_at: null,
        open: true,
        activities: [],
      };
      open.set(r.user_id, session);
      sessions.push(session);
      continue;
    }

    if (r.user_id && r.action === 'LOGOUT') {
      const session = open.get(r.user_id);
      if (session) {
        session.logout_at = r.created_at;
        session.open = false;
        open.delete(r.user_id);
      }
      continue;
    }

    const event = {
      user_id: r.user_id,
      full_name: r.full_name,
      role: r.role,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details: r.details,
      created_at: r.created_at,
    };
    const session = r.user_id ? open.get(r.user_id) : null;
    if (session) session.activities.push(event);
    else unassigned.push(event);
  }

  sessions.reverse();
  unassigned.reverse();
  res.json({ sessions, unassigned });
});

module.exports = { listAudit, listSessions };
