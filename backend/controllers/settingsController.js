const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { setSetting } = require('../utils/helpers');
const { audit } = require('../utils/audit');
const { DEFAULT_QUESTIONS, SETTING_KEY, serialise } = require('../utils/screening');
const { backfillAbsenceFines } = require('./fineController');

// ---------------------------------------------------------------------------
// GROUP RULES
// The rules of the group itself: money amounts, voting, the background
// questions. The chairperson (role 'admin') proposes a change and the treasurer
// confirms it before it takes effect.
// ---------------------------------------------------------------------------
const GROUP_RULES = {
  loan_multiplier: 'How many times their savings a member may borrow',
  default_interest_rate: 'Interest rate offered on loans (%)',
  weekly_share_value: 'Value of one share',
  welfare_contribution: 'Welfare contribution per meeting',
  registration_fee: 'One-off registration fee paid when a new member joins (MWK)',
  monthly_levy: 'Monthly contribution every member pays for the group wrappers (MWK)',
  absence_fine: 'Fine for missing a meeting without a reason (MWK)',
  late_fine: 'Fine for coming late to a meeting (MWK)',
  misconduct_fine: 'Fine for misconduct at a meeting (MWK)',
  case_voting_days: 'How many days a vote about a member stays open',
  case_quorum_percent: 'Share of members who must vote for the result to count (%)',
  case_dismiss_percent: 'Share of yes votes needed to dismiss a member (%)',
  office_voting_days: 'How many days an election to fill an office stays open',
  office_quorum_percent: 'Share of members who must vote in an office election for the result to count (%)',
  [SETTING_KEY]: 'Background questions members answer about a person asking to join',
};

// The share-out switches (include_interest, include_fines, ...) are group rules
// too, but they are named by the group, so they are matched by their prefix.
const isGroupRule = (key) => key in GROUP_RULES || key.startsWith('include_');

const GROUP_NUMERIC = [
  'loan_multiplier', 'default_interest_rate', 'weekly_share_value', 'welfare_contribution',
  'registration_fee', 'monthly_levy', 'absence_fine', 'late_fine', 'misconduct_fine',
  'case_voting_days', 'case_quorum_percent', 'case_dismiss_percent',
  'office_voting_days', 'office_quorum_percent',
];

// ---------------------------------------------------------------------------
// SYSTEM SETTINGS
// How the system itself behaves. The administrator alone looks after these.
// The TextBee keys are secrets and stay out of the database.
// ---------------------------------------------------------------------------
const SYSTEM_SETTINGS = {
  session_timeout_minutes: { default: '10', label: 'How long a quiet session stays open (minutes)' },
  max_login_attempts: { default: '3', label: 'Wrong passwords allowed before the account locks' },
  lock_minutes: { default: '5', label: 'How long a locked account stays locked (minutes)' },
  reset_max_tries: { default: '3', label: 'Tries allowed at one SMS reset code' },
  sms_enabled: { default: 'true', label: 'Send text messages (on / off)', bool: true },
};

// GET /api/settings/group-rules  (chairperson and treasurer)
const listGroupRules = wrap(async (req, res) => {
  const rows = await query(`SELECT setting_key, setting_value, updated_at FROM settings ORDER BY setting_key`);

  // A group that has never touched the screening questions still gets the
  // defaults, so the page always shows what is actually asked.
  if (!rows.some((r) => r.setting_key === SETTING_KEY)) {
    rows.push({ setting_key: SETTING_KEY, setting_value: JSON.stringify(DEFAULT_QUESTIONS), updated_at: null });
  }

  res.json(rows.filter((r) => isGroupRule(r.setting_key)).map((r) => ({ ...r, label: GROUP_RULES[r.setting_key] })));
});

/** Check one group-rule value, or throw a message the page can show. */
function cleanGroupRule(key, value) {
  if (key === SETTING_KEY) {
    let parsed;
    try {
      parsed = JSON.parse(String(value));
    } catch {
      throw new Error('The background questions were not valid.');
    }
    if (!Array.isArray(parsed)) throw new Error('The background questions were not valid.');
    return serialise(parsed);
  }
  if (key.startsWith('include_')) {
    return String(value).toLowerCase() === 'yes' ? 'yes' : 'no';
  }
  const v = String(value).trim();
  if (GROUP_NUMERIC.includes(key) && (Number.isNaN(Number(v)) || Number(v) < 0)) {
    throw new Error(`${GROUP_RULES[key]} must be a number.`);
  }
  return v;
}

// PUT /api/settings/group-rules
// A group rule is never changed by one person alone. The administrator looks
// after the settings but proposes the change to the chairperson; the chairperson
// herself proposes to the treasurer. Either way the rule only changes once the
// other person confirms it, and nobody may confirm her own proposal.
const proposeGroupRules = wrap(async (req, res) => {
  const updates = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(updates).filter((k) => isGroupRule(k));
  if (!keys.length) return res.status(400).json({ message: 'Nothing to change.' });

  const payload = {};
  for (const key of keys) {
    try {
      payload[key] = cleanGroupRule(key, updates[key]);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  const approver = req.user.role === 'system_admin' ? 'admin' : 'treasurer';
  const who = approver === 'admin' ? 'the chairperson' : 'the treasurer';

  const waiting = await query(`SELECT id FROM change_requests WHERE kind = 'group_rules' AND status = 'pending' LIMIT 1`);
  if (waiting.length) {
    return res.status(409).json({ message: `A change to the group rules is already waiting for ${who}.` });
  }

  const reason = String(req.body?.reason || '').trim() || null;
  const row = (await query(
    `INSERT INTO change_requests (kind, requested_by, approver_role, payload, reason)
     VALUES ('group_rules', $1, $2, $3, $4) RETURNING id`,
    [req.user.id, approver, JSON.stringify(payload), reason]
  ))[0];

  await audit(req.user.id, 'PROPOSE_GROUP_RULES', 'change_requests', row.id, Object.keys(payload).join(', '));
  res.status(201).json({ message: `Sent to ${who} to confirm.`, id: row.id });
});

/** Apply group-rule changes (used when the treasurer confirms a proposal). */
async function applyGroupRules(payload, userId) {
  const keys = Object.keys(payload || {}).filter((k) => isGroupRule(k));
  for (const key of keys) await setSetting(key, payload[key], 'group');
  await audit(userId, 'UPDATE_SETTINGS', 'settings', null, keys.join(', '));

  let fines_created = 0;
  if (keys.includes('absence_fine') && Number(payload.absence_fine) > 0) {
    fines_created = await backfillAbsenceFines({ recorded_by: userId });
  }
  return { keys, fines_created };
}

// GET /api/settings/system  (administrator)
const listSystemSettings = wrap(async (req, res) => {
  const rows = await query(
    `SELECT setting_key, setting_value, updated_at FROM settings WHERE setting_key = ANY($1)`,
    [Object.keys(SYSTEM_SETTINGS)]
  );
  const found = new Map(rows.map((r) => [r.setting_key, r]));
  res.json(Object.keys(SYSTEM_SETTINGS).map((key) => ({
    setting_key: key,
    setting_value: found.has(key) ? found.get(key).setting_value : SYSTEM_SETTINGS[key].default,
    updated_at: found.has(key) ? found.get(key).updated_at : null,
    label: SYSTEM_SETTINGS[key].label,
  })));
});

// PUT /api/settings/system  (administrator)
const updateSystemSettings = wrap(async (req, res) => {
  const updates = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(updates).filter((k) => k in SYSTEM_SETTINGS);
  if (!keys.length) return res.status(400).json({ message: 'Nothing to change.' });

  for (const key of keys) {
    const value = String(updates[key]).trim();
    if (SYSTEM_SETTINGS[key].bool) {
      if (!['true', 'false'].includes(value.toLowerCase())) {
        return res.status(400).json({ message: 'Text messages must be on or off.' });
      }
      await setSetting(key, value.toLowerCase(), 'system');
      continue;
    }
    if (Number.isNaN(Number(value)) || Number(value) < 1) {
      return res.status(400).json({ message: `${SYSTEM_SETTINGS[key].label} must be a whole number of 1 or more.` });
    }
    await setSetting(key, value, 'system');
  }

  await audit(req.user.id, 'UPDATE_SYSTEM_SETTINGS', 'settings', null, keys.join(', '));
  res.json({ message: 'Saved.', updated: keys });
});

module.exports = {
  GROUP_RULES, SYSTEM_SETTINGS,
  listGroupRules, proposeGroupRules, applyGroupRules,
  listSystemSettings, updateSystemSettings,
};
