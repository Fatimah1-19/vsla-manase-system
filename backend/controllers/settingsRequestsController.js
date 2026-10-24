const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

const VALID_CATEGORIES = ['general', 'savings', 'loans', 'fines', 'welfare', 'shareout', 'membership', 'voting', 'meetings', 'sms'];

const createRequest = wrap(async (req, res) => {
  const { category, title, description, details } = req.body || {};
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'Invalid category.' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ message: 'Description is required.' });
  }

  const row = (await query(
    `INSERT INTO settings_requests (category, title, description, details, requested_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [category, title ? String(title).trim() : null, String(description).trim(), details ? String(details).trim() : null, req.user.id]
  ))[0];

  await audit(req.user.id, 'CREATE_SETTINGS_REQUEST', 'settings_requests', row.id, `category:${category}`);
  res.status(201).json(row);
});

const listMine = wrap(async (req, res) => {
  const rows = await query(
    `SELECT sr.*, u.full_name as requested_by_name
     FROM settings_requests sr
     JOIN users u ON u.id = sr.requested_by
     WHERE sr.requested_by = $1
     ORDER BY sr.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

const listAll = wrap(async (req, res) => {
  const { status, category } = req.query || {};
  let sql = `SELECT sr.*, u.full_name as requested_by_name,
             imp.full_name as implemented_by_name
             FROM settings_requests sr
             JOIN users u ON u.id = sr.requested_by
             LEFT JOIN users imp ON imp.id = sr.implemented_by
             WHERE 1=1`;
  const params = [];
  if (status) {
    params.push(status);
    sql += ` AND sr.status = $${params.length}`;
  }
  if (category && VALID_CATEGORIES.includes(category)) {
    params.push(category);
    sql += ` AND sr.category = $${params.length}`;
  }
  sql += ' ORDER BY sr.created_at DESC';
  const rows = await query(sql, params);
  res.json(rows);
});

const getCounts = wrap(async (req, res) => {
  const rows = await query(
    `SELECT category, COUNT(*) as count
     FROM settings_requests
     WHERE status = 'pending'
     GROUP BY category`
  );
  const counts = {};
  for (const r of rows) counts[r.category] = parseInt(r.count, 10);
  res.json(counts);
});

const markRead = wrap(async (req, res) => {
  const { id } = req.params;
  await query(
    `UPDATE settings_requests SET read_by_admin = TRUE, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  res.json({ ok: true });
});

const completeRequest = wrap(async (req, res) => {
  const { id } = req.params;
  const { affected_setting, previous_value, new_value } = req.body || {};

  const existing = (await query(`SELECT * FROM settings_requests WHERE id = $1`, [id]))[0];
  if (!existing) return res.status(404).json({ message: 'Request not found.' });
  if (existing.status !== 'pending') return res.status(400).json({ message: 'Request already processed.' });

  const row = (await query(
    `UPDATE settings_requests
     SET status = 'completed', implemented_by = $1, implemented_at = NOW(),
         affected_setting = $2, previous_value = $3, new_value = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [req.user.id, affected_setting || null, previous_value || null, new_value || null, id]
  ))[0];

  await audit(req.user.id, 'COMPLETE_SETTINGS_REQUEST', 'settings_requests', id, `category:${existing.category}`);
  res.json(row);
});

const rejectRequest = wrap(async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body || {};
  if (!rejection_reason || !String(rejection_reason).trim()) {
    return res.status(400).json({ message: 'Rejection reason is required.' });
  }

  const existing = (await query(`SELECT * FROM settings_requests WHERE id = $1`, [id]))[0];
  if (!existing) return res.status(404).json({ message: 'Request not found.' });
  if (existing.status !== 'pending') return res.status(400).json({ message: 'Request already processed.' });

  const row = (await query(
    `UPDATE settings_requests
     SET status = 'rejected', implemented_by = $1, implemented_at = NOW(),
         rejection_reason = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [req.user.id, String(rejection_reason).trim(), id]
  ))[0];

  await audit(req.user.id, 'REJECT_SETTINGS_REQUEST', 'settings_requests', id, `category:${existing.category}`);
  res.json(row);
});

module.exports = {
  createRequest,
  listMine,
  listAll,
  getCounts,
  markRead,
  completeRequest,
  rejectRequest
};
