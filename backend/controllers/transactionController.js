const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

/**
 * The whole money story in one place. Each of the treasurer's books is read for
 * the rows the page shows: what it was, who it was for, how much, a reference
 * back to the row it came from, who wrote it and where it stands.
 *
 * Nothing here writes to those books. Corrections are separate records that
 * point back at a line; the line itself is never edited or deleted.
 */

// The kinds of money movement the feed can show, and the table each lives in.
const FEED_TYPES = ['savings', 'loan', 'loan_repayment', 'fine', 'welfare', 'share_out', 'correction'];

// Every money row, collected into one shape:
//   kind, id, date, member_id, full_name, has_avatar, amount, reference,
//   recorded_by_name, status, note
const FEED_SQL = `
  SELECT 'savings' AS kind, s.id, s.date, s.member_id, u.full_name,
         (m.avatar IS NOT NULL) AS has_avatar, s.amount::float AS amount,
         ('SAV-' || s.id) AS reference, r.full_name AS recorded_by_name,
         s.status, s.note
    FROM savings s
    JOIN members m ON m.id = s.member_id JOIN users u ON u.id = m.user_id
    LEFT JOIN users r ON r.id = s.recorded_by

  UNION ALL

  SELECT 'loan', l.id, l.applied_at::date, l.member_id, u.full_name,
         (m.avatar IS NOT NULL), l.amount::float,
         ('LN-' || l.id), r.full_name,
         l.status, l.purpose
    FROM loans l
    JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
    LEFT JOIN users r ON r.id = l.approved_by

  UNION ALL

  SELECT 'loan_repayment', rp.id, rp.date, l.member_id, u.full_name,
         (m.avatar IS NOT NULL), rp.amount::float,
         ('RP-' || rp.id || ' / LN-' || l.id), rr.full_name,
         rp.status, NULL
    FROM loan_repayments rp
    JOIN loans l ON l.id = rp.loan_id
    JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
    LEFT JOIN users rr ON rr.id = rp.recorded_by

  UNION ALL

  SELECT 'fine', f.id, f.date, f.member_id, u.full_name,
         (m.avatar IS NOT NULL), f.amount::float,
         ('FN-' || f.id), r.full_name,
         CASE WHEN f.paid THEN 'paid' ELSE 'unpaid' END, f.reason
    FROM fines f
    JOIN members m ON m.id = f.member_id JOIN users u ON u.id = m.user_id
    LEFT JOIN users r ON r.id = f.recorded_by

  UNION ALL

  SELECT 'welfare', w.id, w.date, w.member_id, u.full_name,
         (m.avatar IS NOT NULL), w.amount::float,
         ('WF-' || w.id), r.full_name,
         w.type, w.notes
    FROM welfare_fund w
    LEFT JOIN members m ON m.id = w.member_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN users r ON r.id = w.recorded_by

  UNION ALL

  SELECT 'share_out', so.id, COALESCE(so.date_distributed, so.created_at::date), NULL, NULL,
         FALSE, so.total_fund::float,
         ('SO-' || so.id), r.full_name,
         so.status, c.cycle_name
    FROM share_out so
    LEFT JOIN users r ON r.id = so.distributed_by
    LEFT JOIN cycles c ON c.id = so.cycle_id

  UNION ALL

  SELECT 'correction', tc.id, tc.created_at::date, tc.member_id, u.full_name,
         (m.avatar IS NOT NULL), NULL,
         ('COR-' || tc.id || ' / ' || tc.entity_type || '-' || tc.entity_id), r.full_name,
         tc.entity_type, tc.reason
    FROM transaction_corrections tc
    LEFT JOIN members m ON m.id = tc.member_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN users r ON r.id = tc.corrected_by
`;

/** Build the filter params and the matching WHERE for the union above. */
function feedFilter(q) {
  const where = [];
  const params = [];
  if (q.type && FEED_TYPES.includes(q.type)) { params.push(q.type); where.push(`f.kind = $${params.length}`); }
  if (q.member_id) { params.push(Number(q.member_id)); where.push(`f.member_id = $${params.length}`); }
  if (q.from) { params.push(q.from); where.push(`f.date >= $${params.length}::date`); }
  if (q.to) { params.push(q.to); where.push(`f.date <= $${params.length}::date`); }
  if (q.status) { params.push(q.status); where.push(`f.status = $${params.length}`); }
  if (q.q) {
    params.push(`%${String(q.q)}%`);
    where.push(`(COALESCE(f.full_name,'') ILIKE $${params.length}
                 OR COALESCE(f.reference,'') ILIKE $${params.length}
                 OR COALESCE(f.note,'') ILIKE $${params.length})`);
  }
  return { params, filterSql: where.length ? 'WHERE ' + where.join(' AND ') : '' };
}

// GET /api/transactions — the pooled financial activity feed
const listTransactions = wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const { params, filterSql } = feedFilter(req.query);

  const total = (await query(
    `SELECT COUNT(*)::int AS c FROM (${FEED_SQL}) f ${filterSql}`,
    params
  ))[0].c;

  const rows = await query(
    `SELECT * FROM (${FEED_SQL}) f ${filterSql}
      ORDER BY f.date DESC, f.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  // The filter dropdowns are filled from what is actually there.
  const members = await query(
    `SELECT DISTINCT f.member_id, f.full_name FROM (${FEED_SQL}) f
      WHERE f.member_id IS NOT NULL ORDER BY f.full_name`
  );
  const statuses = (await query(
    `SELECT DISTINCT f.status FROM (${FEED_SQL}) f WHERE f.status IS NOT NULL ORDER BY f.status`
  )).map((r) => r.status);

  res.json({ rows, total, page, limit, types: FEED_TYPES, members, statuses });
});

// ---- corrections ---------------------------------------------------------

// The tables a correction may point at. Each maps to how we read its value.
const CORRECTABLE = {
  savings: { table: 'savings', member: 'member_id', label: 'savings' },
  loans: { table: 'loans', member: 'member_id', label: 'loans' },
  loan_repayments: { table: 'loan_repayments', member: null, label: 'loan_repayments' },
  fines: { table: 'fines', member: 'member_id', label: 'fines' },
  welfare_fund: { table: 'welfare_fund', member: 'member_id', label: 'welfare_fund' },
  share_out: { table: 'share_out', member: null, label: 'share_out' },
};

// GET /api/transactions/corrections — every correction ever made
const listCorrections = wrap(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.entity_type) { params.push(req.query.entity_type); where.push(`tc.entity_type = $${params.length}`); }
  if (req.query.entity_id) { params.push(Number(req.query.entity_id)); where.push(`tc.entity_id = $${params.length}`); }
  if (req.query.member_id) { params.push(Number(req.query.member_id)); where.push(`tc.member_id = $${params.length}`); }

  const rows = await query(
    `SELECT tc.id, tc.entity_type, tc.entity_id, tc.member_id, tc.reason,
            tc.previous_value, tc.new_value, tc.created_at,
            u.full_name AS corrected_by_name, m.full_name AS member_name
       FROM transaction_corrections tc
       LEFT JOIN users u ON u.id = tc.corrected_by
       LEFT JOIN members m ON m.id = tc.member_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY tc.created_at DESC, tc.id DESC`,
    params
  );
  res.json(rows);
});

/**
 * POST /api/transactions/corrections
 * Fix a wrong figure the honest way: write a NEW record that says what was
 * wrong, what it said, what it should say and why. The original row is left
 * exactly as it was. Stored value, a written reason and the audit trail all
 * carry the change, so it can never happen quietly.
 */
const recordCorrection = wrap(async (req, res) => {
  const { entity_type, entity_id, reason, new_value } = req.body;
  const meta = CORRECTABLE[entity_type];
  if (!meta) {
    return res.status(400).json({ message: 'That is not a record the books keep.' });
  }
  const id = Number(entity_id);
  if (!id) return res.status(400).json({ message: 'Choose the record to correct.' });

  const why = String(reason || '').trim();
  if (!why) return res.status(400).json({ message: 'Say why this correction is being made.' });
  if (why.length > 500) return res.status(400).json({ message: 'Keep the reason shorter.' });

  const next = String(new_value == null ? '' : new_value).trim();
  if (!next) return res.status(400).json({ message: 'Enter the correct value.' });

  // Read the row as it stands now: this becomes the recorded previous value.
  const original = await one(`SELECT * FROM ${meta.table} WHERE id = $1`, [id]);
  if (!original) return res.status(404).json({ message: 'That record is not in the books.' });

  const previous = original.amount != null ? String(original.amount) : '';
  if (previous === next) {
    return res.status(400).json({ message: 'The new value is the same as the old one.' });
  }

  const memberId = meta.member ? original[meta.member] : null;
  const row = await one(
    `INSERT INTO transaction_corrections
       (entity_type, entity_id, member_id, reason, previous_value, new_value, corrected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [entity_type, id, memberId, why, previous, next, req.user.id]
  );

  // The correction is also written to the trail, with the old and the new value.
  await audit(req.user.id, 'CORRECT_TRANSACTION', entity_type, id,
    `${meta.label} #${id}: ${previous} -> ${next}; reason: ${why}`,
    { previous, next });

  res.status(201).json({
    message: 'Correction recorded. The original entry is unchanged.',
    correction: { ...row, entity_type, entity_id: id, reason: why, previous_value: previous, new_value: next },
  });
});

module.exports = { listTransactions, listCorrections, recordCorrection };
