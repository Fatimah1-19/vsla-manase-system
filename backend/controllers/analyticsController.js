const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { getActiveCycle, loanTotals, cashInBox } = require('../utils/helpers');
const { arrears, currentMonth, monthsBetween, getLevy } = require('../utils/wrappers');
const { computeShareOut } = require('./shareOutController');

const round = (n) => +Number(n || 0).toFixed(2);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/**
 * GET /api/analytics — the numbers behind every chart on the Analytics page.
 * Committee only. Money is in kwacha, months are "YYYY-MM".
 */
const analytics = wrap(async (req, res) => {
  const cycle = await getActiveCycle();
  const cid = cycle ? cycle.id : null;

  // The last 12 calendar months, oldest first.
  const now = currentMonth();
  const [ny, nm] = now.split('-').map(Number);
  const first = new Date(ny, nm - 12, 1);
  const startYm = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
  const months = monthsBetween(startYm, now);
  const from = `${startYm}-01`;

  const byMonth = async (sql) =>
    Object.fromEntries((await query(sql, [from])).map((r) => [r.ym, r.v]));

  const [savingsBy, repaidBy, interestBy, givenBy, finesBy, wrappersBy, welfareInBy, welfareOutBy] = await Promise.all([
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM savings WHERE status='verified' AND date >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM loan_repayments WHERE status='verified' AND date >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(interest_part)::float AS v FROM loan_repayments WHERE status='verified' AND date >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(decided_at,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM loans
              WHERE status IN ('verified','repaid','defaulted') AND decided_at >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM fines WHERE paid = TRUE AND date >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(paid_on,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM monthly_contributions WHERE paid_on >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM welfare_fund WHERE type = 'contribution' AND date >= $1::date GROUP BY 1`),
    byMonth(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM welfare_fund WHERE type = 'payout' AND date >= $1::date GROUP BY 1`),
  ]);

  const monthly = months.map((ym) => ({
    month: ym,
    savings: round(savingsBy[ym]), repayments: round(repaidBy[ym]), interest: round(interestBy[ym]),
    loans_given: round(givenBy[ym]), fines: round(finesBy[ym]), wrappers: round(wrappersBy[ym]),
    welfare_in: round(welfareInBy[ym]), welfare_out: round(welfareOutBy[ym]),
  }));

  // ---- Members and savings -------------------------------------------------
  const ranking = await query(
    `SELECT m.id AS member_id, u.full_name, COALESCE(SUM(s.amount),0)::float AS total
       FROM members m JOIN users u ON u.id = m.user_id
       LEFT JOIN savings s ON s.member_id = m.id AND s.cycle_id = $1 AND s.status = 'verified'
      WHERE m.status = 'active' GROUP BY m.id, u.full_name ORDER BY total DESC, u.full_name`,
    [cid]
  );
  const totals = ranking.map((r) => r.total).sort((a, b) => a - b);
  const totalSavings = totals.reduce((a, b) => a + b, 0);
  const median = totals.length
    ? (totals.length % 2 ? totals[(totals.length - 1) / 2] : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2)
    : 0;

  const joined = await query(`SELECT to_char(date_joined,'YYYY-MM') AS ym, COUNT(*)::int AS c FROM members GROUP BY 1`);
  const joinedBy = Object.fromEntries(joined.map((r) => [r.ym, r.c]));
  let running = (await one(`SELECT COUNT(*)::int AS c FROM members WHERE date_joined < $1::date`, [from])).c;
  const growth = months.map((ym) => { running += joinedBy[ym] || 0; return { month: ym, members: running }; });

  // ---- Loans ---------------------------------------------------------------
  const loanRows = await query(
    `SELECT l.id, l.member_id, l.amount::float, l.with_interest, l.interest_rate::float, l.status,
            to_char(l.due_date,'YYYY-MM-DD') AS due_date, u.full_name,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id AND r.status = 'verified'),0)::float AS total_repaid
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id`
  );
  const today = new Date().toISOString().slice(0, 10);
  const statusCount = { pending: 0, approved: 0, pending_verification: 0, verified: 0, repaid: 0, rejected: 0, defaulted: 0 };
  let dueSum = 0; let paidSum = 0; let outstanding = 0; let overdueOutstanding = 0; let lentPrincipal = 0;
  const borrowers = [];

  for (const l of loanRows) {
    statusCount[l.status] = (statusCount[l.status] || 0) + 1;
    if (!['verified', 'repaid'].includes(l.status)) continue;
    const { totalDue } = loanTotals(l);
    dueSum += totalDue; paidSum += Math.min(l.total_repaid, totalDue); lentPrincipal += l.amount;
    if (l.status === 'verified') {
      const owing = Math.max(0, totalDue - l.total_repaid);
      const overdue = !!l.due_date && l.due_date < today;
      outstanding += owing;
      if (overdue) overdueOutstanding += owing;
      borrowers.push({ loan_id: l.id, full_name: l.full_name, outstanding: round(owing), due_date: l.due_date, overdue });
    }
  }
  borrowers.sort((a, b) => b.outstanding - a.outstanding);

  const interest = await one(
    `SELECT COALESCE(SUM(r.interest_part),0)::float AS earned
       FROM loan_repayments r JOIN loans l ON l.id = r.loan_id WHERE l.cycle_id = $1 AND r.status = 'verified'`, [cid]
  );

  // ---- Meetings ------------------------------------------------------------
  const meetings = (await query(
    `SELECT mt.id, to_char(mt.meeting_date,'YYYY-MM-DD') AS date,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present, COUNT(a.id)::int AS marked
       FROM meetings mt LEFT JOIN attendance a ON a.meeting_id = mt.id
      GROUP BY mt.id ORDER BY mt.meeting_date DESC LIMIT 8`
  )).reverse().map((m) => ({ ...m, rate: m.marked ? pct(m.present, m.marked) : null }));
  const heldWithMarks = meetings.filter((m) => m.rate !== null);
  const attendanceRate = heldWithMarks.length
    ? Math.round(heldWithMarks.reduce((a, m) => a + m.rate, 0) / heldWithMarks.length) : 0;

  // ---- Fines, welfare, wrappers -------------------------------------------
  const fines = await one(
    `SELECT COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END),0)::float AS collected,
            COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END),0)::float AS outstanding,
            COUNT(*)::int AS count FROM fines`
  );
  const welfare = await one(
    `SELECT COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE 0 END),0)::float AS contributions,
            COALESCE(SUM(CASE WHEN type='payout' THEN amount ELSE 0 END),0)::float AS payouts FROM welfare_fund`
  );
  const welfareByCategory = await query(
    `SELECT COALESCE(category,'other') AS category, SUM(amount)::float AS total
       FROM welfare_fund WHERE type = 'payout' GROUP BY 1 ORDER BY 2 DESC`
  );

  const levy = await getLevy();
  const owing = await arrears();
  const monthPaid = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS v FROM monthly_contributions WHERE period = $1::date`,
    [`${now}-01`]
  );
  const wrappersTotal = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS v FROM monthly_contributions WHERE cycle_id = $1`, [cid]
  );

  // ---- If the cycle ended today -------------------------------------------
  let projection = null;
  if (cid) {
    const sh = await computeShareOut(cid);
    projection = { ...sh.breakdown, members: sh.total_members };
  }

  const cash = await cashInBox(cid);

  res.json({
    cycle, generated_at: new Date().toISOString(),
    members: {
      active: ranking.length,
      avg_savings: ranking.length ? round(totalSavings / ranking.length) : 0,
      median_savings: round(median),
      top_savers: ranking.slice(0, 5),
      growth,
    },
    savings: {
      total: round(totalSavings),
      by_member: ranking.map((r) => ({ full_name: r.full_name, total: round(r.total) })),
    },
    loans: {
      status: statusCount, lent_principal: round(lentPrincipal), outstanding: round(outstanding),
      overdue_outstanding: round(overdueOutstanding),
      collection_rate: pct(paidSum, dueSum),
      portfolio_at_risk: pct(overdueOutstanding, outstanding),
      interest_earned: round(interest.earned),
      box_in_use: pct(outstanding, cash + outstanding),
      borrowers: borrowers.slice(0, 10),
    },
    repayments: {
      total: round(paidSum), outstanding: round(outstanding), collection_rate: pct(paidSum, dueSum),
    },
    cash_in_box: cash,
    meetings: { recent: meetings, attendance_rate: attendanceRate },
    fines: {
      total: round(fines.collected + fines.outstanding), paid: round(fines.collected),
      outstanding: round(fines.outstanding), count: fines.count,
    },
    welfare: {
      contributions: round(welfare.contributions), payouts: round(welfare.payouts),
      balance: round(welfare.contributions - welfare.payouts), by_category: welfareByCategory,
    },
    wrappers: {
      monthly: levy, month: now, collected_this_month: round(monthPaid.v),
      expected_this_month: levy * ranking.length, cycle_total: round(wrappersTotal.v),
      behind: owing.rows.slice(0, 10), behind_count: owing.rows.length, total_owed: owing.total_owed,
    },
    projection,
    monthly,
  });
});

module.exports = { analytics };
