const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { emit, EVENTS } = require('../utils/events');
const { getActiveCycle, getSetting } = require('../utils/helpers');

/**
 * A fine for missing a meeting, when the group has set one.
 * The amount lives in Settings (`absence_fine`); 0 means the group does not
 * fine for absences. Never throws — attendance is saved either way.
 */
const createAbsenceFine = async ({ member_id, reason = null, date = null, recorded_by = null, meeting_id = null, cycle_id = null }) => {
  const amount = Number(await getSetting('absence_fine', '0'));
  if (!(amount > 0)) return null;
  const cycle = cycle_id ? { id: cycle_id } : await getActiveCycle();
  const member = await one(
    `SELECT m.id, u.full_name, u.phone, u.language
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`,
    [member_id]
  );
  if (!member) return null;
  const fineDate = date || new Date().toISOString().slice(0, 10);
  const fineReason = reason || 'Unexcused absence';

  // One fine per member per meeting, so re-saving attendance never stacks them up.
  const existing = meeting_id
    ? await one(`SELECT id FROM fines WHERE member_id=$1 AND meeting_id=$2 LIMIT 1`, [member_id, meeting_id])
    : await one(
        `SELECT id FROM fines WHERE member_id=$1 AND date=$2 AND reason=$3 AND paid=FALSE LIMIT 1`,
        [member_id, fineDate, fineReason]
      );
  if (existing) return existing;

  const fine = await one(
    `INSERT INTO fines (member_id, cycle_id, meeting_id, amount, reason, paid, date, recorded_by)
     VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7) RETURNING id, amount::float, date`,
    [member_id, cycle ? cycle.id : null, meeting_id, amount, fineReason, fineDate, recorded_by || null]
  );

  await emit(EVENTS.FINE_RECORDED, { recordedBy: recorded_by, member, fine, reason: fineReason });

  return fine;
};

/**
 * Charge every unexcused absence that has not been charged yet.
 * Used when the group switches the absence fine on, so the people who already
 * missed a meeting are not forgotten. Safe to call again and again.
 */
const backfillAbsenceFines = async ({ recorded_by = null } = {}) => {
  const amount = Number(await getSetting('absence_fine', '0'));
  if (!(amount > 0)) return { created: 0 };

  const rows = await query(
    `SELECT a.member_id, a.meeting_id, mt.meeting_date, mt.cycle_id
       FROM attendance a
       JOIN meetings mt ON mt.id = a.meeting_id
      WHERE a.status = 'absent'
        AND NOT EXISTS (
          SELECT 1 FROM fines f WHERE f.member_id = a.member_id AND f.meeting_id = a.meeting_id
        )`
  );

  let created = 0;
  for (const r of rows) {
    const fine = await createAbsenceFine({
      member_id: r.member_id,
      meeting_id: r.meeting_id,
      cycle_id: r.cycle_id,
      date: r.meeting_date,
      recorded_by,
    });
    if (fine) created += 1;
  }
  return { created };
};

// POST /api/fines
const recordFine = wrap(async (req, res) => {
  const { member_id, amount, reason, date, paid } = req.body;
  if (!member_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Choose a member and enter an amount above zero.' });
  }

  const member = await one(
    `SELECT m.id, u.full_name, u.phone, u.language
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`,
    [member_id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not active.' });

  const cycle = await getActiveCycle();
  const fine = await one(
    `INSERT INTO fines (member_id, cycle_id, amount, reason, paid, date, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, amount::float, date`,
    [member_id, cycle ? cycle.id : null, amount, reason || null, !!paid,
     date || new Date().toISOString().slice(0, 10), req.user.id]
  );

  const [sms] = await emit(EVENTS.FINE_RECORDED, {
    recordedBy: req.user.id, member, fine, reason: reason || null,
  });

  res.status(201).json({ message: `Fine recorded for ${member.full_name}.`, fine, sms_sent: !!(sms && sms.ok) });
});

// GET /api/fines
const listFines = wrap(async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === 'member') { params.push(req.user.member_id); where.push(`f.member_id = $${params.length}`); }
  else if (req.query.member_id) { params.push(req.query.member_id); where.push(`f.member_id = $${params.length}`); }

  const rows = await query(
    `SELECT f.id, f.amount::float, f.reason, f.paid, f.date, f.member_id,
            f.meeting_id, f.cycle_id, to_char(f.date,'YYYY-MM') AS month,
            c.cycle_name, mt.meeting_date,
            m.membership_number, u.full_name, (m.avatar IS NOT NULL) AS has_avatar
       FROM fines f JOIN members m ON m.id = f.member_id JOIN users u ON u.id = m.user_id
       LEFT JOIN cycles c ON c.id = f.cycle_id
       LEFT JOIN meetings mt ON mt.id = f.meeting_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY f.date DESC, f.id DESC`,
    params
  );
  res.json(rows);
});

// PATCH /api/fines/:id/pay
const markPaid = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const updated = await one(`UPDATE fines SET paid = TRUE WHERE id = $1 RETURNING id, amount::float`, [id]);
  if (!updated) return res.status(404).json({ message: 'That fine is not in the book.' });
  await audit(req.user.id, 'FINE_PAID', 'fines', id,
    `paid unpaid -> paid, amount ${updated.amount}, reason: payment received`);
  res.json({ message: 'Fine marked as paid.' });
});

// DELETE /api/fines/:id
const deleteFine = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  const existing = await one(`SELECT * FROM fines WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That fine is not in the book.' });
  await query(`DELETE FROM fines WHERE id = $1`, [id]);
  await audit(req.user.id, 'DELETE_FINE', 'fines', id,
    `amount ${existing.amount} (${existing.paid ? 'paid' : 'unpaid'}), member ${existing.member_id} -> removed; reason: ${reason || 'not given'}`);
  res.json({ message: 'Fine removed.' });
});

// GET /api/fines/summary
const finesSummary = wrap(async (req, res) => {
  const row = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS total,
            COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END),0)::float AS collected,
            COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END),0)::float AS outstanding,
            COUNT(*)::int AS count
       FROM fines`
  );
  res.json(row);
});

module.exports = { recordFine, listFines, markPaid, deleteFine, finesSummary, createAbsenceFine, backfillAbsenceFines };
