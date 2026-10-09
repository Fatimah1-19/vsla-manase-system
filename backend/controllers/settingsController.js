const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { setSetting } = require('../utils/helpers');
const { audit } = require('../utils/audit');

const EDITABLE = {
  loan_multiplier: 'How many times their savings a member may borrow',
  default_interest_rate: 'Interest rate offered on loans (%)',
  weekly_share_value: 'Value of one share',
  welfare_contribution: 'Welfare contribution per meeting',
  monthly_levy: 'Monthly contribution every member pays for the group wrappers (MWK)',
  absence_fine: 'Fine for missing a meeting without a reason (MWK)',
};

// GET /api/settings
const listSettings = wrap(async (req, res) => {
  const rows = await query(`SELECT setting_key, setting_value, updated_at FROM settings ORDER BY setting_key`);
  res.json(rows.filter((r) => r.setting_key in EDITABLE).map((r) => ({ ...r, label: EDITABLE[r.setting_key] })));
});

// PUT /api/settings
const updateSettings = wrap(async (req, res) => {
  const updates = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(updates).filter((k) => k in EDITABLE);

  if (!keys.length) return res.status(400).json({ message: 'Nothing to change.' });

  for (const key of keys) {
    let value = String(updates[key]).trim();
    if (['loan_multiplier', 'default_interest_rate', 'weekly_share_value', 'welfare_contribution', 'monthly_levy', 'absence_fine'].includes(key)) {
      if (Number.isNaN(Number(value)) || Number(value) < 0) {
        return res.status(400).json({ message: `${EDITABLE[key]} must be a number.` });
      }
    }
    await setSetting(key, value);
  }

  await audit(req.user.id, 'UPDATE_SETTINGS', 'settings', null, keys.join(', '));
  res.json({ message: 'Settings saved.', updated: keys });
});

module.exports = { listSettings, updateSettings };
