const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { setSetting } = require('../utils/helpers');
const { audit } = require('../utils/audit');
const { DEFAULT_QUESTIONS, SETTING_KEY, serialise } = require('../utils/screening');

const EDITABLE = {
  loan_multiplier: 'How many times their savings a member may borrow',
  default_interest_rate: 'Interest rate offered on loans (%)',
  weekly_share_value: 'Value of one share',
  welfare_contribution: 'Welfare contribution per meeting',
  registration_fee: 'One-off registration fee paid when a new member joins (MWK)',
  monthly_levy: 'Monthly contribution every member pays for the group wrappers (MWK)',
  absence_fine: 'Fine for missing a meeting without a reason (MWK)',
  case_voting_days: 'How many days a vote about a member stays open',
  case_quorum_percent: 'Share of members who must vote for the result to count (%)',
  case_dismiss_percent: 'Share of yes votes needed to dismiss a member (%)',
  office_voting_days: 'How many days an election to fill an office stays open',
  office_quorum_percent: 'Share of members who must vote in an office election for the result to count (%)',
  [SETTING_KEY]: 'Background questions members answer about a person asking to join',
};

const NUMERIC = [
  'loan_multiplier', 'default_interest_rate', 'weekly_share_value', 'welfare_contribution',
  'registration_fee', 'monthly_levy', 'absence_fine', 'case_voting_days', 'case_quorum_percent', 'case_dismiss_percent',
  'office_voting_days', 'office_quorum_percent',
];

// GET /api/settings
const listSettings = wrap(async (req, res) => {
  const rows = await query(`SELECT setting_key, setting_value, updated_at FROM settings ORDER BY setting_key`);

  // A group that has never touched the screening questions still gets the
  // defaults, so the Settings page always shows what is actually asked.
  if (!rows.some((r) => r.setting_key === SETTING_KEY)) {
    rows.push({
      setting_key: SETTING_KEY,
      setting_value: JSON.stringify(DEFAULT_QUESTIONS),
      updated_at: null,
    });
  }

  res.json(rows.filter((r) => r.setting_key in EDITABLE).map((r) => ({ ...r, label: EDITABLE[r.setting_key] })));
});

// PUT /api/settings
const updateSettings = wrap(async (req, res) => {
  const updates = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(updates).filter((k) => k in EDITABLE);

  if (!keys.length) return res.status(400).json({ message: 'Nothing to change.' });

  for (const key of keys) {
    if (key === SETTING_KEY) {
      let parsed;
      try {
        parsed = JSON.parse(String(updates[key]));
      } catch {
        return res.status(400).json({ message: 'The background questions were not valid.' });
      }
      if (!Array.isArray(parsed)) {
        return res.status(400).json({ message: 'The background questions were not valid.' });
      }
      await setSetting(key, serialise(parsed));
      continue;
    }

    let value = String(updates[key]).trim();
    if (NUMERIC.includes(key)) {
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
