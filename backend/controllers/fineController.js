const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { emit, EVENTS } = require('../utils/events');
const { getActiveCycle, getSetting } = require('../utils/helpers');

/**
 * The kinds of fine the group recognises. The amount of a named kind is fixed
 * by the group's Fine Settings and can never be typed in by the treasurer; only
 * "other" takes a free amount, and that always needs a reason.
 */
const FINE_TYPES = {
  absence: { setting: 'absence_fine', reason: 'Unexcused absence' },
  late: { setting: 'late_fine', reason: 'Late to a meeting' },
  misconduct: { setting: 'misconduct_fine', reason: 'Misconduct at a meeting' },
  other: { setting: null, reason: null },
};

// A fine must carry a real calendar date, never in the future.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayISO = () => new Date().toISOString().slice(0, 10);
function validDate(value) {
  if (!ISO_DATE.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

/** The amount the group has set for a fine kind (0 means the kind is off). */
async function configuredAmount(type) {
  const meta = FINE_TYPES[type];
  if (!meta) return null;
  if (!meta.setting) return null; // "other" has no configured amount
  return Number(await getSetting(meta.setting, '0'));
}

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
    `INSERT INTO fines (member_id, cycle_id, meeting_id, amount, reason, fine_type, paid, date, recorded_by)
     VALUES ($1,$2,$3,$4,$5,'absence',FALSE,$6,$7) RETURNING id, amount::float, date`,
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
  const { member_id, fine_type, amount, reason, date, paid } = req.body;
  const type = fine_type || 'other';

  // The kind of fine must be one the group recognises.
  if (!FINE_TYPES[type]) {
    return res.status(400).json({ message: 'Choose a fine type the group recognises.' });
  }
  if (!member_id) return res.status(400).json({ message: 'Choose a member.' });

  // The date is confirmed when the fine is recorded: real, and never ahead.
  const theDate = date || todayISO();
  if (!validDate(theDate)) {
    return res.status(400).json({ message: 'Enter a valid date as YYYY-MM-DD.' });
  }
  if (theDate > todayISO()) {
    return res.status(400).json({ message: 'The date cannot be in the future.' });
  }

  const meta = FINE_TYPES[type];
  let theAmount;
  let theReason = (reason && String(reason).trim()) || meta.reason || null;

  if (meta.setting) {
    // A named kind: the amount comes from the group's Fine Settings and can
    // never be changed on the screen. If the kind is switched off, refuse it.
    const configured = await configuredAmount(type);
    if (!(configured > 0)) {
      return res.status(400).json({ message: 'That fine is not set by the group yet.' });
    }
    theAmount = configured;
    // A reason may be given, but the fixed kind also carries its own wording.
    theReason = theReason || meta.reason;
  } else {
    // "Other": the treasurer enters the amount, and must say what it was for.
    const value = Number(amount);
    if (amount === undefined || amount === null || amount === '' || Number.isNaN(value)) {
      return res.status(400).json({ message: 'Enter an amount.' });
    }
    if (value <= 0) return res.status(400).json({ message: 'The amount must be above zero.' });
    if (!Number.isFinite(value) || value > 9999999999.99) {
      return res.status(400).json({ message: 'That amount is not a valid figure.' });
    }
    if (!theReason) return res.status(400).json({ message: 'Give the reason for this fine.' });
    theAmount = value;
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
    `INSERT INTO fines (member_id, cycle_id, amount, reason, fine_type, paid, date, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, amount::float, date, fine_type`,
    [member_id, cycle ? cycle.id : null, theAmount, theReason, type, !!paid, theDate, req.user.id]
  );

  const [sms] = await emit(EVENTS.FINE_RECORDED, {
    recordedBy: req.user.id, member, fine, reason: theReason,
  });

  res.status(201).json({
    message: `Fine recorded for ${member.full_name}.`,
    fine, sms_sent: !!(sms && sms.ok),
  });
});

// GET /api/fines/types — the fine kinds and the amount the group has set
const listFineTypes = wrap(async (req, res) => {
  const types = [];
  for (const [key, meta] of Object.entries(FINE_TYPES)) {
    types.push({
      key,
      fixed: !!meta.setting,
      amount: meta.setting ? await configuredAmount(key) : null,
      reason: meta.reason,
    });
  }
  res.json(types);
});

// GET /api/fines
const listFines = wrap(async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === 'member') { params.push(req.user.member_id); where.push(`f.member_id = $${params.length}`); }
  else if (req.query.member_id) { params.push(req.query.member_id); where.push(`f.member_id = $${params.length}`); }
  // The paid/unpaid switch and the date window the treasurer filters on.
  if (req.query.paid === 'true') where.push(`f.paid = TRUE`);
  else if (req.query.paid === 'false') where.push(`f.paid = FALSE`);
  if (req.query.fine_type) { params.push(req.query.fine_type); where.push(`f.fine_type = $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`f.date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`f.date <= $${params.length}`); }

  const rows = await query(
    `SELECT f.id, f.amount::float, f.reason, f.paid, f.date, f.member_id, f.fine_type,
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
    `paid unpaid -> paid, amount ${updated.amount}, reason: payment received`,
    { previous: 'unpaid', next: 'paid' });
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
  // One line per kind of fine, so the treasurer sees where the money comes from.
  const byType = await query(
    `SELECT fine_type,
            COALESCE(SUM(amount),0)::float AS total,
            COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END),0)::float AS collected,
            COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END),0)::float AS outstanding,
            COUNT(*)::int AS count
       FROM fines GROUP BY fine_type ORDER BY total DESC`
  );
  res.json({ ...row, by_type: byType });
});

module.exports = {
  recordFine, listFines, listFineTypes, markPaid, deleteFine, finesSummary,
  createAbsenceFine, backfillAbsenceFines, FINE_TYPES,
};
