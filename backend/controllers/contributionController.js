const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getActiveCycle } = require('../utils/helpers');
const { MONTH_RE, currentMonth, monthsBetween, getLevy, arrears } = require('../utils/wrappers');

const statusOf = (paid, levy) => (paid >= levy ? 'paid' : paid > 0 ? 'partial' : 'unpaid');

// GET /api/contributions?month=2026-03 — who has paid for one month
const listMonth = wrap(async (req, res) => {
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : currentMonth();
  const levy = await getLevy();

  const rows = await query(
    `SELECT m.id AS member_id, m.membership_number, u.full_name,
            COALESCE((SELECT SUM(c.amount) FROM monthly_contributions c
                       WHERE c.member_id = m.id AND c.period = $1::date),0)::float AS paid
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.status = 'active' ORDER BY u.full_name`,
    [`${month}-01`]
  );

  const members = rows.map((r) => ({
    ...r, balance: Math.max(0, +(levy - r.paid).toFixed(2)), status: statusOf(r.paid, levy),
  }));
  const collected = members.reduce((a, r) => a + Math.min(r.paid, levy), 0);

  res.json({
    month, levy, members,
    totals: {
      expected: levy * members.length,
      collected: +collected.toFixed(2),
      outstanding: +(levy * members.length - collected).toFixed(2),
      paid_count: members.filter((m) => m.status === 'paid').length,
      member_count: members.length,
    },
  });
});

// GET /api/contributions/payments?month=2026-03 — each payment, newest first
const listPayments = wrap(async (req, res) => {
  const where = MONTH_RE.test(req.query.month || '') ? `WHERE c.period = $1::date` : '';
  const params = where ? [`${req.query.month}-01`] : [];
  const rows = await query(
    `SELECT c.id, c.amount::float, c.paid_on, c.note, to_char(c.period,'YYYY-MM') AS month,
            c.member_id, u.full_name, m.membership_number, r.full_name AS recorded_by_name,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM monthly_contributions c
       JOIN members m ON m.id = c.member_id JOIN users u ON u.id = m.user_id
       LEFT JOIN users r ON r.id = c.recorded_by
       ${where} ORDER BY c.paid_on DESC, c.id DESC LIMIT 300`,
    params
  );
  res.json(rows);
});

// GET /api/contributions/mine — the logged-in member's month-by-month record
const mine = wrap(async (req, res) => {
  const levy = await getLevy();
  const cycle = await getActiveCycle();
  if (!req.user.member_id || !cycle) return res.json({ levy, months: [], total_paid: 0, owed: 0 });

  const span = await one(
    `SELECT to_char(start_date,'YYYY-MM') AS s, to_char(end_date,'YYYY-MM') AS e,
            (SELECT to_char(date_joined,'YYYY-MM') FROM members WHERE id = $2) AS joined
       FROM cycles WHERE id = $1`,
    [cycle.id, req.user.member_id]
  );
  const now = currentMonth();
  const from = span.joined > span.s ? span.joined : span.s;
  const last = now < span.e ? now : span.e;

  const paidRows = await query(
    `SELECT to_char(period,'YYYY-MM') AS ym, SUM(amount)::float AS paid
       FROM monthly_contributions WHERE member_id = $1 AND cycle_id = $2 GROUP BY 1`,
    [req.user.member_id, cycle.id]
  );
  const paidBy = Object.fromEntries(paidRows.map((r) => [r.ym, r.paid]));

  const months = (from <= last ? monthsBetween(from, last) : []).map((ym) => ({
    month: ym, paid: paidBy[ym] || 0, status: statusOf(paidBy[ym] || 0, levy),
  }));
  const totalPaid = paidRows.reduce((a, r) => a + r.paid, 0);
  res.json({
    levy, months, total_paid: totalPaid,
    owed: Math.max(0, +(months.length * levy - totalPaid).toFixed(2)),
  });
});

// GET /api/contributions/arrears — members who are behind
const behind = wrap(async (req, res) => {
  const a = await arrears();
  res.json({ levy: a.levy, rows: a.rows, total_owed: a.total_owed });
});

// POST /api/contributions — the treasurer or secretary records a payment
const record = wrap(async (req, res) => {
  const { member_id, amount, month, paid_on, note } = req.body;
  const ym = MONTH_RE.test(month || '') ? month : currentMonth();
  const pay = Number(amount);

  if (!member_id || !pay || pay <= 0) {
    return res.status(400).json({ message: 'Choose a member and enter an amount above zero.' });
  }

  const member = await one(
    `SELECT m.id, u.full_name, u.phone, u.language FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`, [member_id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not active.' });

  const levy = await getLevy();
  const already = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS paid FROM monthly_contributions
      WHERE member_id = $1 AND period = $2::date`, [member_id, `${ym}-01`]
  );
  if (already.paid + pay > levy + 0.01) {
    return res.status(400).json({
      message: `That is more than the monthly amount. Already paid ${already.paid.toLocaleString()} of ${levy.toLocaleString()} for ${ym}.`,
      paid: already.paid, levy,
    });
  }

  const cycle = await getActiveCycle();
  const row = await one(
    `INSERT INTO monthly_contributions (member_id, cycle_id, period, amount, paid_on, note, recorded_by)
     VALUES ($1,$2,$3::date,$4,$5,$6,$7) RETURNING id, amount::float`,
    [member_id, cycle ? cycle.id : null, `${ym}-01`, pay,
     paid_on || new Date().toISOString().slice(0, 10), note || null, req.user.id]
  );

  await audit(req.user.id, 'RECORD_MONTHLY_CONTRIBUTION', 'monthly_contributions', row.id,
    `${member.full_name}: ${pay} for ${ym}`);

  const balance = Math.max(0, +(levy - already.paid - pay).toFixed(2));
  const sms = await sendSMS(
    member.phone,
    build('levyRecorded', member.language, { name: member.full_name, amount: pay, month: ym, balance }),
    { name: member.full_name, category: 'monthly', sentBy: req.user.id }
  );

  res.status(201).json({
    message: `Monthly contribution recorded for ${member.full_name}.`,
    payment: row, balance, sms_sent: sms.ok,
  });
});

// DELETE /api/contributions/:id — admin removes a mistaken entry
const remove = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await one(`SELECT * FROM monthly_contributions WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That entry is not in the book.' });
  await query(`DELETE FROM monthly_contributions WHERE id = $1`, [id]);
  await audit(req.user.id, 'DELETE_MONTHLY_CONTRIBUTION', 'monthly_contributions', id, `Removed ${existing.amount}`);
  res.json({ message: 'Entry removed.' });
});

module.exports = { listMonth, listPayments, mine, behind, record, remove };
