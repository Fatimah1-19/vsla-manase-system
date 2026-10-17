const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

// Turn the page's filters into a WHERE clause. Shared by the list and the export.
function buildFilters(req) {
  const { action, user_id, from, to, q } = req.query;
  const where = [];
  const params = [];
  if (action) { params.push(action); where.push(`a.action = $${params.length}`); }
  if (user_id) { params.push(Number(user_id)); where.push(`a.user_id = $${params.length}`); }
  if (from) { params.push(from); where.push(`a.created_at >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`); }
  if (q) {
    params.push(`%${String(q)}%`);
    where.push(`(COALESCE(a.details,'') ILIKE $${params.length} OR COALESCE(u.full_name,'') ILIKE $${params.length} OR a.action ILIKE $${params.length})`);
  }
  return { where, params, filterSql: where.length ? 'WHERE ' + where.join(' AND ') : '' };
}

const SELECT = `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
                       a.user_id, u.full_name, u.role
                  FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id`;

// GET /api/audit  — the whole history, filtered and paged
const listAudit = wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const { params, filterSql } = buildFilters(req);

  const total = (await query(`SELECT COUNT(*)::int AS c FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${filterSql}`, params))[0].c;

  const rows = await query(
    `${SELECT} ${filterSql} ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const actions = (await query(`SELECT DISTINCT action FROM audit_logs ORDER BY action`)).map((r) => r.action);

  // Looking at the history is itself worth remembering. Only on a fresh view,
  // not on every page of the same look.
  if (page === 1) await audit(req.user.id, 'VIEW_AUDIT', 'audit_logs', null, filterSql || 'all');

  res.json({ rows, total, page, limit, actions });
});

// GET /api/audit/export — the same history as a file the group can keep
const exportAudit = wrap(async (req, res) => {
  const { params, filterSql } = buildFilters(req);
  const rows = await query(`${SELECT} ${filterSql} ORDER BY a.created_at DESC, a.id DESC LIMIT 5000`, params);

  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['When', 'Who', 'Role', 'Action', 'Type', 'Record', 'Details'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.created_at ? new Date(r.created_at).toISOString() : '',
      r.full_name || 'System', r.role || '', r.action || '',
      r.entity_type || '', r.entity_id == null ? '' : r.entity_id, r.details || '',
    ].map(cell).join(','));
  }

  await audit(req.user.id, 'EXPORT_AUDIT', 'audit_logs', null, `${rows.length} rows`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
  res.send('\uFEFF' + lines.join('\r\n'));
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

module.exports = { listAudit, exportAudit, listSessions };
