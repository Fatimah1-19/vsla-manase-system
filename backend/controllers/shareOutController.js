const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getActiveCycle } = require('../utils/helpers');
const { calcShares, totalsOf } = require('../utils/shareout');

/**
 * Work out what each member is owed at the end of the cycle.
 * The rules live in utils/shareout.js (and are tested there).
 */
async function computeShareOut(cycleId) {
  // The two questions do not depend on each other, so ask them together.
  const [members, kept] = await Promise.all([
    query(
    `SELECT m.id AS member_id, m.membership_number, m.status, u.full_name, u.phone, u.language,
            COALESCE((SELECT SUM(s.amount) FROM savings s
                       WHERE s.member_id = m.id AND s.cycle_id = $1),0)::float AS member_savings,
            -- interest this member actually paid on their own loans in this cycle
            COALESCE((SELECT SUM(r.interest_part) FROM loan_repayments r
                        JOIN loans l ON l.id = r.loan_id
                       WHERE l.member_id = m.id AND l.cycle_id = $1),0)::float AS interest_paid,
            COALESCE((SELECT SUM(f.amount) FROM fines f
                       WHERE f.member_id = m.id AND f.paid = FALSE),0)::float AS unpaid_fines,
            COALESCE((SELECT SUM(x.due - x.paid) FROM (
                        SELECT l.amount + CASE WHEN l.with_interest THEN l.amount * l.interest_rate / 100 ELSE 0 END AS due,
                               COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0) AS paid
                          FROM loans l WHERE l.member_id = m.id AND l.status = 'approved') x),0)::float AS unpaid_loan
       FROM members m JOIN users u ON u.id = m.user_id
      ORDER BY u.full_name`,
    [cycleId]),
    // Money that is NOT shared. It stays with the group.
    one(
    `SELECT
       COALESCE((SELECT SUM(amount) FROM fines WHERE paid = TRUE AND cycle_id = $1),0)::float AS fines_kept,
       COALESCE((SELECT SUM(CASE WHEN type='contribution' THEN amount ELSE -amount END)
                   FROM welfare_fund),0)::float AS welfare_kept,
       COALESCE((SELECT SUM(amount) FROM monthly_contributions WHERE cycle_id = $1),0)::float AS wrappers_kept`,
    [cycleId]),
  ]);

  const shares = calcShares(members);
  const totals = totalsOf(shares);

  return {
    breakdown: { ...totals, ...kept },
    total_members: shares.length,
    shares,
  };
}

// GET /api/shareout/preview — look before you distribute
const preview = wrap(async (req, res) => {
  const cycle = await getActiveCycle();
  if (!cycle) return res.status(400).json({ message: 'No saving cycle is running.' });

  const [result, openLoans] = await Promise.all([
    computeShareOut(cycle.id),
    one(`SELECT COUNT(*)::int AS c FROM loans WHERE status IN ('pending','approved')`),
  ]);
  res.json({ cycle, ...result, open_loans: openLoans.c });
});

// POST /api/shareout — save the calculation as a draft
const createShareOut = wrap(async (req, res) => {
  const cycle = await getActiveCycle();
  if (!cycle) return res.status(400).json({ message: 'No saving cycle is running.' });

  const existing = await one(
    `SELECT id, status FROM share_out WHERE cycle_id = $1 ORDER BY id DESC LIMIT 1`, [cycle.id]
  );
  if (existing && existing.status === 'distributed') {
    return res.status(400).json({ message: 'This cycle has already been shared out.' });
  }

  const result = await computeShareOut(cycle.id);
  const b = result.breakdown;
  if (!result.shares.length || b.total_payout <= 0) {
    return res.status(400).json({ message: 'There is nothing to share out yet.' });
  }

  const saved = await tx(async (client) => {
    if (existing) await client.query(`DELETE FROM share_out WHERE id = $1`, [existing.id]);

    const { rows } = await client.query(
      `INSERT INTO share_out (cycle_id, total_savings, total_interest, total_fines, total_welfare,
                              total_fund, total_members, status)
       VALUES ($1,$2,$3,0,0,$4,$5,'draft') RETURNING *`,
      [cycle.id, b.total_savings, b.interest_returned, b.total_payout, result.total_members]
    );
    const shareOut = rows[0];

    for (const s of result.shares) {
      await client.query(
        `INSERT INTO share_out_details
           (share_out_id, member_id, member_savings, profit_share, deductions, unrecovered, share_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [shareOut.id, s.member_id, s.member_savings, s.profit_share, s.deductions, s.unrecovered, s.share_amount]
      );
    }
    return shareOut;
  });

  await audit(req.user.id, 'CREATE_SHAREOUT', 'share_out', saved.id, `Total payout ${b.total_payout}`);
  res.status(201).json({ message: 'Share-out calculated and saved as a draft.', share_out: saved, ...result });
});

/**
 * POST /api/shareout/:id/distribute
 * Hand out the money and text every member their own figure.
 */
const distribute = wrap(async (req, res) => {
  const id = Number(req.params.id);

  // Flip the status first and only once, so two people pressing the button
  // at the same time cannot hand out the money twice.
  const claimed = await one(
    `UPDATE share_out SET status = 'distributed', date_distributed = CURRENT_DATE, distributed_by = $2
      WHERE id = $1 AND status = 'draft' RETURNING id`,
    [id, req.user.id]
  );
  if (!claimed) {
    const exists = await one(`SELECT status FROM share_out WHERE id = $1`, [id]);
    if (!exists) return res.status(404).json({ message: 'That share-out does not exist.' });
    return res.status(400).json({ message: 'This share-out has already been handed out.' });
  }

  const lines = await query(
    `SELECT d.id, d.member_savings::float AS member_savings, d.profit_share::float AS interest_returned,
            d.deductions::float AS deductions, d.share_amount::float AS share_amount,
            u.full_name, u.phone, u.language
       FROM share_out_details d
       JOIN members m ON m.id = d.member_id
       JOIN users u ON u.id = m.user_id
      WHERE d.share_out_id = $1
      ORDER BY u.full_name`,
    [id]
  );

  let sent = 0;
  let failed = 0;
  for (const line of lines) {
    const result = await sendSMS(
      line.phone,
      build('shareOutReady', line.language, {
        name: line.full_name, amount: line.share_amount, savings: line.member_savings,
        interest: line.interest_returned, deductions: line.deductions,
      }),
      { name: line.full_name, category: 'shareout', isBroadcast: true, sentBy: req.user.id }
    );
    if (result.ok) { sent++; await query(`UPDATE share_out_details SET notified = TRUE WHERE id = $1`, [line.id]); }
    else failed++;
    await new Promise((r) => setTimeout(r, 350));
  }

  await audit(req.user.id, 'DISTRIBUTE_SHAREOUT', 'share_out', id, `${lines.length} member(s), ${sent} notified`);

  res.json({
    message: `Share-out handed out. ${sent} of ${lines.length} member(s) were texted.`,
    notified: { sent, failed, total: lines.length },
  });
});

// GET /api/shareout
const listShareOuts = wrap(async (req, res) => {
  const rows = await query(
    `SELECT so.*, so.total_fund::float AS total_fund, so.total_savings::float AS total_savings,
            so.total_interest::float AS total_interest,
            c.cycle_name, u.full_name AS distributed_by_name
       FROM share_out so
       LEFT JOIN cycles c ON c.id = so.cycle_id
       LEFT JOIN users u ON u.id = so.distributed_by
      ORDER BY so.id DESC`
  );
  res.json(rows);
});

const DETAIL_COLUMNS = `d.id, d.member_id, d.notified,
  d.member_savings::float AS member_savings, d.profit_share::float AS profit_share,
  d.deductions::float AS deductions, d.unrecovered::float AS unrecovered, d.share_amount::float AS share_amount`;

// GET /api/shareout/:id
const getShareOut = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const shareOut = await one(
    `SELECT so.*, c.cycle_name, u.full_name AS distributed_by_name
       FROM share_out so LEFT JOIN cycles c ON c.id = so.cycle_id
       LEFT JOIN users u ON u.id = so.distributed_by WHERE so.id = $1`, [id]
  );
  if (!shareOut) return res.status(404).json({ message: 'That share-out does not exist.' });

  const params = [id];
  let filter = '';
  if (req.user.role === 'member') { params.push(req.user.member_id); filter = `AND d.member_id = $2`; }

  const details = await query(
    `SELECT ${DETAIL_COLUMNS}, u.full_name, m.membership_number
       FROM share_out_details d
       JOIN members m ON m.id = d.member_id
       JOIN users u ON u.id = m.user_id
      WHERE d.share_out_id = $1 ${filter}
      ORDER BY u.full_name`,
    params
  );
  res.json({ share_out: shareOut, details });
});

// GET /api/shareout/mine — what the logged-in member is owed
const myShare = wrap(async (req, res) => {
  if (!req.user.member_id) return res.json(null);
  const row = await one(
    `SELECT ${DETAIL_COLUMNS}, so.status, so.date_distributed, c.cycle_name
       FROM share_out_details d
       JOIN share_out so ON so.id = d.share_out_id
       LEFT JOIN cycles c ON c.id = so.cycle_id
      WHERE d.member_id = $1 ORDER BY so.id DESC LIMIT 1`,
    [req.user.member_id]
  );
  res.json(row);
});

module.exports = { computeShareOut, preview, createShareOut, distribute, listShareOuts, getShareOut, myShare };