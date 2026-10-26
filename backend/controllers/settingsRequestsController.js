const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { getSetting, setSetting } = require('../utils/helpers');
const { applyGroupRules, cleanGroupRule } = require('./settingsController');

// The values that belong to each existing VSLA Settings page. A submission is
// always tied to one of these categories, so it can only land in its own tab.
const GROUP_FIELDS = {
  savings: ['weekly_share_value', 'monthly_levy'],
  loans: ['loan_multiplier', 'default_interest_rate'],
  fines: ['absence_fine'],
  welfare: ['welfare_contribution'],
  shareout: ['include_interest_in_shareout', 'include_fines_in_shareout', 'include_welfare_in_shareout'],
  membership: ['registration_fee'],
  voting: ['case_voting_days', 'case_quorum_percent', 'case_dismiss_percent', 'office_voting_days', 'office_quorum_percent'],
};
const CATEGORY_FIELDS = {
  ...GROUP_FIELDS,
  general: [],
  meetings: [],
  sms: ['sms_enabled'],
};

const VALID_CATEGORIES = ['general', 'savings', 'loans', 'fines', 'welfare', 'shareout', 'membership', 'voting', 'meetings', 'sms'];

/** Keep only the settings that belong to this category, with clean values. */
function cleanRequestedValues(category, input) {
  const allowed = CATEGORY_FIELDS[category] || [];
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) {
      return { error: `That setting does not belong to ${category}.` };
    }
    if (value === undefined || value === null || String(value).trim() === '') continue;

    if (key === 'sms_enabled') {
      const next = String(value).toLowerCase();
      if (!['true', 'false'].includes(next)) {
        return { error: 'Text messages must be on or off.' };
      }
      values[key] = next;
      continue;
    }

    try {
      values[key] = cleanGroupRule(key, value);
    } catch (err) {
      return { error: err.message };
    }
  }
  return { values };
}

const fieldList = (values) => Object.keys(values || {}).join(', ');

// POST /api/settings-requests — the chairperson sends one category's configuration.
const createRequest = wrap(async (req, res) => {
  const { category, title, description, details, note, requested_values } = req.body || {};
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'Invalid category.' });
  }

  const cleaned = cleanRequestedValues(category, requested_values);
  if (cleaned.error) return res.status(400).json({ message: cleaned.error });
  const values = cleaned.values;

  const summary = String(description || '').trim();
  const instruction = String(details ?? note ?? '').trim();
  if (!Object.keys(values).length && !summary) {
    return res.status(400).json({ message: 'Enter the configuration requested.' });
  }

  const row = (await query(
    `INSERT INTO settings_requests
       (category, title, description, details, requested_values, requested_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      category,
      title ? String(title).trim() : null,
      summary || 'Configuration requested',
      instruction || null,
      JSON.stringify(values),
      req.user.id,
    ]
  ))[0];

  await audit(req.user.id, 'CREATE_SETTINGS_REQUEST', 'settings_requests', row.id,
    `category:${category}`, { next: JSON.stringify(values) });
  res.status(201).json(row);
});

// GET /api/settings-requests/mine — the chairperson follows what she sent.
const listMine = wrap(async (req, res) => {
  const { category } = req.query || {};
  let sql = `SELECT sr.*, u.full_name AS requested_by_name,
                    imp.full_name AS implemented_by_name
               FROM settings_requests sr
               JOIN users u ON u.id = sr.requested_by
               LEFT JOIN users imp ON imp.id = sr.implemented_by
              WHERE sr.requested_by = $1`;
  const params = [req.user.id];
  if (category && VALID_CATEGORIES.includes(category)) {
    params.push(category);
    sql += ` AND sr.category = $${params.length}`;
  }
  sql += ' ORDER BY sr.created_at DESC';
  res.json(await query(sql, params));
});

// GET /api/settings-requests — the system administrator reads one category at a time.
const listAll = wrap(async (req, res) => {
  const { status, category } = req.query || {};
  let sql = `SELECT sr.*, u.full_name AS requested_by_name,
                    imp.full_name AS implemented_by_name
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
  res.json(await query(sql, params));
});

// GET /api/settings-requests/counts — a badge for each affected settings tab.
const getCounts = wrap(async (req, res) => {
  const rows = await query(
    `SELECT category, COUNT(*) AS count
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

// POST /api/settings-requests/:id/configure — put the requested values into force
// in the existing settings, then close the submission. The administrator may
// send adjusted values, but only for the category the chairperson selected.
const configureRequest = wrap(async (req, res) => {
  const { id } = req.params;
  const existing = (await query(`SELECT * FROM settings_requests WHERE id = $1`, [id]))[0];
  if (!existing) return res.status(404).json({ message: 'Request not found.' });
  if (existing.status !== 'pending') return res.status(400).json({ message: 'Request already processed.' });

  const supplied = req.body?.values;
  const source = supplied && typeof supplied === 'object' && !Array.isArray(supplied)
    ? supplied
    : (existing.requested_values || {});
  const cleaned = cleanRequestedValues(existing.category, source);
  if (cleaned.error) return res.status(400).json({ message: cleaned.error });
  const values = cleaned.values;
  const keys = Object.keys(values);

  let previous = null;
  let next = null;

  if (GROUP_FIELDS[existing.category] && keys.length) {
    const applied = await applyGroupRules(values, req.user.id);
    previous = applied.previous || null;
    next = applied.next || null;
  } else if (existing.category === 'sms' && keys.includes('sms_enabled')) {
    const before = await getSetting('sms_enabled', 'true');
    await setSetting('sms_enabled', values.sms_enabled, 'system');
    previous = `sms_enabled=${before}`;
    next = `sms_enabled=${values.sms_enabled}`;
    await audit(req.user.id, 'UPDATE_SYSTEM_SETTINGS', 'settings', null, 'sms_enabled',
      { previous: before, next: values.sms_enabled });
  }

  const row = (await query(
    `UPDATE settings_requests
        SET status = 'completed', implemented_by = $1, implemented_at = NOW(),
            affected_setting = $2, previous_value = $3, new_value = $4, updated_at = NOW()
      WHERE id = $5 RETURNING *`,
    [req.user.id, fieldList(values) || existing.affected_setting || null, previous, next || JSON.stringify(values), id]
  ))[0];

  await audit(req.user.id, 'CONFIGURE_SETTINGS_REQUEST', 'settings_requests', id,
    `category:${existing.category}; ${fieldList(values) || 'note only'}`,
    { previous, next: next || JSON.stringify(values) });
  res.json(row);
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
    [req.user.id, affected_setting || existing.affected_setting, previous_value || null,
      new_value || JSON.stringify(existing.requested_values || {}), id]
  ))[0];

  await audit(req.user.id, 'COMPLETE_SETTINGS_REQUEST', 'settings_requests', id,
    `category:${existing.category}`, { next: new_value || JSON.stringify(existing.requested_values || {}) });
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
  configureRequest,
  completeRequest,
  rejectRequest,
};
