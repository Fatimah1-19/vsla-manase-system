const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { emit, EVENTS } = require('../utils/events');
const { getActiveCycle } = require('../utils/helpers');

const BALANCE_SQL = `
  SELECT COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE 0 END),0)::float AS contributions,
         COALESCE(SUM(CASE WHEN type='payout'       THEN amount ELSE 0 END),0)::float AS payouts,
         (COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE 0 END),0)
        - COALESCE(SUM(CASE WHEN type='payout'       THEN amount ELSE 0 END),0))::float AS balance
    FROM welfare_fund`;

// POST /api/welfare/contribution
const recordContribution = wrap(async (req, res) => {
  const { member_id, amount, date, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Enter an amount above zero.' });

  const cycle = await getActiveCycle();
  const row = await one(
    `INSERT INTO welfare_fund (member_id, cycle_id, amount, type, date, notes, recorded_by)
     VALUES ($1,$2,$3,'contribution',$4,$5,$6) RETURNING id, amount::float`,
    [member_id || null, cycle ? cycle.id : null, amount,
     date || new Date().toISOString().slice(0, 10), notes || null, req.user.id]
  );

  const member = member_id
    ? await one(
        `SELECT u.full_name, u.phone, u.language FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
        [member_id]
      )
    : null;

  await emit(EVENTS.WELFARE_CONTRIBUTION, { recordedBy: req.user.id, transaction: row, member });

  res.status(201).json({ message: 'Welfare contribution recorded.', transaction: row });
});

/**
 * POST /api/welfare/payout
 * Sickness or a funeral: the member gets told what was sent, and — if the
 * group agrees to it — everyone else is told so they can visit or attend.
 */
const recordPayout = wrap(async (req, res) => {
  const { member_id, amount, category = 'other', notes, date, announce_to_group = true } = req.body;

  if (!member_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Choose a member and enter an amount above zero.' });
  }
  if (!['sickness', 'funeral', 'emergency', 'other'].includes(category)) {
    return res.status(400).json({ message: 'Choose sickness, funeral, emergency or other.' });
  }

  const balanceRow = await one(BALANCE_SQL);
  if (Number(amount) > balanceRow.balance) {
    return res.status(400).json({
      message: `The welfare fund only has ${balanceRow.balance.toLocaleString()}.`,
      available: balanceRow.balance,
    });
  }

  const member = await one(
    `SELECT m.id, u.id AS user_id, u.full_name, u.phone, u.language
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [member_id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not on the list.' });

  const cycle = await getActiveCycle();
  const row = await one(
    `INSERT INTO welfare_fund (member_id, cycle_id, amount, type, category, date, notes, recorded_by)
     VALUES ($1,$2,$3,'payout',$4,$5,$6,$7) RETURNING id, amount::float`,
    [member_id, cycle ? cycle.id : null, amount, category,
     date || new Date().toISOString().slice(0, 10), notes || null, req.user.id]
  );

  const [announced] = await emit(EVENTS.WELFARE_PAYOUT, {
    recordedBy: req.user.id, transaction: row, member, category, notes, announceToGroup: announce_to_group,
  });

  const after = await one(BALANCE_SQL);
  res.status(201).json({
    message: `Welfare payment recorded for ${member.full_name}.`,
    transaction: row, remaining_balance: after.balance, group_notified: announced || { sent: 0, failed: 0, total: 0 },
  });
});

// GET /api/welfare/balance
const getBalance = wrap(async (req, res) => res.json(await one(BALANCE_SQL)));

// GET /api/welfare
const listWelfare = wrap(async (req, res) => {
  const rows = await query(
    `SELECT w.id, w.amount::float, w.type, w.category, w.date, w.notes, w.member_id,
            u.full_name, m.membership_number, r.full_name AS recorded_by_name,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM welfare_fund w
       LEFT JOIN members m ON m.id = w.member_id
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN users r ON r.id = w.recorded_by
      ORDER BY w.date DESC, w.id DESC`
  );
  res.json(rows);
});

module.exports = { recordContribution, recordPayout, getBalance, listWelfare };
