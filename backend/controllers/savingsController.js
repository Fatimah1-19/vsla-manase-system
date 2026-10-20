const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { emit, EVENTS } = require('../utils/events');
const { getActiveCycle } = require('../utils/helpers');

// A saving must carry a real calendar date, never in the future: the money is
// written down on the day it was handed over.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayISO = () => new Date().toISOString().slice(0, 10);
function validDate(value) {
  if (!ISO_DATE.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

// POST /api/savings — treasurer or secretary records money handed over at the meeting
const recordSaving = wrap(async (req, res) => {
  const { member_id, amount, shares, date, note } = req.body;
  const recordedBy = req.user.id;

  // The member must be chosen, and the amount must be a real, above-zero number.
  if (!member_id) return res.status(400).json({ message: 'Choose a member.' });
  const value = Number(amount);
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(value)) {
    return res.status(400).json({ message: 'Enter an amount.' });
  }
  if (value <= 0) return res.status(400).json({ message: 'The amount must be above zero.' });
  if (!Number.isFinite(value) || value > 9999999999.99) {
    return res.status(400).json({ message: 'That amount is not a valid figure.' });
  }
  if (shares !== undefined && shares !== null && shares !== '' && Number(shares) < 1) {
    return res.status(400).json({ message: 'Shares must be at least one.' });
  }

  // The date is confirmed at the moment of recording: it must be a real date,
  // and never a day that has not happened yet.
  const theDate = date || todayISO();
  if (!validDate(theDate)) {
    return res.status(400).json({ message: 'Enter a valid transaction date as YYYY-MM-DD.' });
  }
  if (theDate > todayISO()) {
    return res.status(400).json({ message: 'The transaction date cannot be in the future.' });
  }

  const member = await one(
    `SELECT m.id, u.id AS user_id, u.full_name, u.phone, u.language
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`,
    [member_id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not active.' });

  const cycle = await getActiveCycle();
  if (!cycle) return res.status(400).json({ message: 'No saving cycle is running. Start one first.' });

  // The same member cannot be written down twice for the same amount on the
  // same day — that is almost always a double tap, not two handovers.
  const duplicate = await one(
    `SELECT id FROM savings
      WHERE member_id = $1 AND amount = $2 AND date = $3 AND cycle_id = $4`,
    [member_id, value, theDate, cycle.id]
  );
  if (duplicate) {
    return res.status(409).json({
      message: 'That saving is already in the book for this member on this date.',
      duplicate_id: duplicate.id,
    });
  }

  const saving = await one(
    `INSERT INTO savings (member_id, cycle_id, amount, shares, date, note, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, amount::float, date`,
    [member_id, cycle.id, value, shares || 1, theDate, note || null, recordedBy]
  );

  const totals = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS total FROM savings WHERE member_id = $1 AND cycle_id = $2`,
    [member_id, cycle.id]
  );

  // Announce it: a listener writes the audit trail and texts her the receipt.
  const [sms] = await emit(EVENTS.SAVING_RECORDED, {
    recordedBy, member, saving, total: totals.total,
  });

  res.status(201).json({
    message: `Saving recorded for ${member.full_name}.`,
    saving, member_total: totals.total,
    sms_sent: !!(sms && sms.ok), sms_error: sms && sms.ok ? null : (sms && sms.error),
  });
});

// GET /api/savings
const listSavings = wrap(async (req, res) => {
  const { cycle_id, member_id, limit = 200 } = req.query;
  const where = [];
  const params = [];

  if (cycle_id) { params.push(cycle_id); where.push(`s.cycle_id = $${params.length}`); }
  if (member_id) { params.push(member_id); where.push(`s.member_id = $${params.length}`); }
  params.push(Math.min(Number(limit) || 200, 1000));

  const rows = await query(
    `SELECT s.id, s.amount::float, s.shares, s.date, s.note, s.member_id, s.cycle_id,
            m.membership_number, u.full_name, r.full_name AS recorded_by_name,
            (m.avatar IS NOT NULL) AS has_avatar
       FROM savings s
       JOIN members m ON m.id = s.member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN users r ON r.id = s.recorded_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.date DESC, s.id DESC
      LIMIT $${params.length}`,
    params
  );
  res.json(rows);
});

// GET /api/savings/summary
const savingsSummary = wrap(async (req, res) => {
  const cycle = await getActiveCycle();
  const totals = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS total_savings,
            COUNT(*)::int AS entries,
            COUNT(DISTINCT member_id)::int AS savers
       FROM savings WHERE ($1::int IS NULL OR cycle_id = $1)`,
    [cycle ? cycle.id : null]
  );
  const perMember = await query(
    `SELECT m.id AS member_id, u.full_name, m.membership_number,
            COALESCE(SUM(s.amount),0)::float AS total_savings,
            COALESCE(SUM(s.shares),0)::int AS total_shares
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN savings s ON s.member_id = m.id AND ($1::int IS NULL OR s.cycle_id = $1)
      WHERE m.status = 'active'
      GROUP BY m.id, u.full_name, m.membership_number
      ORDER BY total_savings DESC`,
    [cycle ? cycle.id : null]
  );
  res.json({ cycle, ...totals, per_member: perMember });
});

// PATCH /api/savings/:id — corrections, admin and treasurer only
const updateSaving = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { amount, date, note, shares } = req.body;

  if (amount !== undefined && Number(amount) <= 0) {
    return res.status(400).json({ message: 'The amount must be above zero.' });
  }
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number.isNaN(Number(amount)))) {
    return res.status(400).json({ message: 'That amount is not a valid figure.' });
  }
  if (shares !== undefined && Number(shares) < 1) {
    return res.status(400).json({ message: 'Shares must be at least one.' });
  }
  if (date !== undefined && date !== null && date !== '') {
    if (!validDate(date)) {
      return res.status(400).json({ message: 'Enter a valid transaction date as YYYY-MM-DD.' });
    }
    if (date > todayISO()) {
      return res.status(400).json({ message: 'The transaction date cannot be in the future.' });
    }
  }

  const existing = await one(`SELECT * FROM savings WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That entry is not in the book.' });

  await query(
    `UPDATE savings SET amount = COALESCE($2, amount), date = COALESCE($3, date), note = COALESCE($4, note),
            shares = COALESCE($5, shares)
      WHERE id = $1`,
    [id, amount ?? null, date ?? null, note ?? null, shares ?? null]
  );

  await audit(req.user.id, 'UPDATE_SAVING', 'savings', id,
    `was ${existing.amount} (${existing.shares} shares), now ${amount ?? existing.amount} (${shares ?? existing.shares} shares)`,
    { previous: `${existing.amount} / ${existing.shares} shares`, next: `${amount ?? existing.amount} / ${shares ?? existing.shares} shares` });
  res.json({ message: 'Entry corrected.' });
});

// DELETE /api/savings/:id
const deleteSaving = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await one(`SELECT * FROM savings WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That entry is not in the book.' });

  await query(`DELETE FROM savings WHERE id = $1`, [id]);
  await audit(req.user.id, 'DELETE_SAVING', 'savings', id,
    `Removed ${existing.amount} for member ${existing.member_id}`);
  res.json({ message: 'Entry removed.' });
});

module.exports = { recordSaving, listSavings, savingsSummary, updateSaving, deleteSaving };
