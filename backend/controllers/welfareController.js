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

// A welfare transaction must carry a real calendar date, never in the future.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayISO = () => new Date().toISOString().slice(0, 10);
function validDate(value) {
  if (!ISO_DATE.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

// POST /api/welfare/contribution
const recordContribution = wrap(async (req, res) => {
  const { member_id, amount, date, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Enter an amount above zero.' });

  // The date is confirmed when the contribution is recorded.
  const theDate = date || todayISO();
  if (!validDate(theDate)) {
    return res.status(400).json({ message: 'Enter a valid date as YYYY-MM-DD.' });
  }
  if (theDate > todayISO()) {
    return res.status(400).json({ message: 'The date cannot be in the future.' });
  }

  const cycle = await getActiveCycle();
  const row = await one(
    `INSERT INTO welfare_fund (member_id, cycle_id, amount, type, date, notes, recorded_by)
     VALUES ($1,$2,$3,'contribution',$4,$5,$6) RETURNING id, amount::float`,
    [member_id || null, cycle ? cycle.id : null, amount, theDate, notes || null, req.user.id]
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

  const theDate = date || todayISO();
  if (!validDate(theDate)) {
    return res.status(400).json({ message: 'Enter a valid date as YYYY-MM-DD.' });
  }
  if (theDate > todayISO()) {
    return res.status(400).json({ message: 'The date cannot be in the future.' });
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
     theDate, notes || null, req.user.id]
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
  const params = [];
  const where = [];
  if (req.query.member_id) { params.push(req.query.member_id); where.push(`w.member_id = $${params.length}`); }
  if (req.query.type) { params.push(req.query.type); where.push(`w.type = $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`w.date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`w.date <= $${params.length}`); }

  const rows = await query(
    `SELECT w.id, w.amount::float, w.type, w.category, w.date, w.notes, w.member_id,
            u.full_name, m.membership_number, r.full_name AS recorded_by_name,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM welfare_fund w
       LEFT JOIN members m ON m.id = w.member_id
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN users r ON r.id = w.recorded_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY w.date DESC, w.id DESC`,
    params
  );
  res.json(rows);
});

// GET /api/welfare/summary
const welfareSummary = wrap(async (req, res) => {
  const totals = await one(BALANCE_SQL);

  // What each member has put in, and what the fund has given back to them.
  const perMember = await query(
    `SELECT w.member_id, u.full_name, m.membership_number,
            (m.avatar IS NOT NULL) AS has_avatar,
            COALESCE(SUM(CASE WHEN w.type='contribution' THEN w.amount ELSE 0 END),0)::float AS contributions,
            COALESCE(SUM(CASE WHEN w.type='payout'       THEN w.amount ELSE 0 END),0)::float AS payouts,
            COUNT(*)::int AS entries
       FROM welfare_fund w
       JOIN members m ON m.id = w.member_id
       JOIN users u ON u.id = m.user_id
      GROUP BY w.member_id, u.full_name, m.membership_number, m.avatar
      HAVING COALESCE(SUM(CASE WHEN w.type='contribution' THEN w.amount ELSE 0 END),0) > 0
          OR COALESCE(SUM(CASE WHEN w.type='payout'       THEN w.amount ELSE 0 END),0) > 0
      ORDER BY contributions DESC, u.full_name`
  );

  // One line per kind of welfare movement, so the treasurer sees the split.
  const byType = await query(
    `SELECT type, category,
            COALESCE(SUM(amount),0)::float AS amount,
            COUNT(*)::int AS count
       FROM welfare_fund GROUP BY type, category ORDER BY type, amount DESC`
  );

  res.json({ ...totals, per_member: perMember, by_type: byType });
});

module.exports = { recordContribution, recordPayout, getBalance, listWelfare, welfareSummary };
