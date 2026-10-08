const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { getActiveCycle, loanTotals, cashInBox, getSetting } = require('../utils/helpers');
const { arrears, currentMonth } = require('../utils/wrappers');

/**
 * GET /api/dashboard
 * Each role sees a different board, so each role gets a different payload.
 */
const getDashboard = wrap(async (req, res) => {
  const cycle = await getActiveCycle();
  const role = req.user.role;

  // What every role sees.
  const base = { role, cycle: null, generated_at: new Date().toISOString() };

  if (cycle) {
    const start = new Date(cycle.start_date);
    const end = new Date(cycle.end_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const elapsed = Math.min(totalDays, Math.max(0, Math.round((Date.now() - start) / 86400000)));
    base.cycle = {
      ...cycle,
      share_value: Number(cycle.share_value),
      total_days: totalDays,
      days_elapsed: elapsed,
      days_remaining: Math.max(0, totalDays - elapsed),
      progress: Math.round((elapsed / totalDays) * 100),
    };
  }

  // ---------- Member ----------
  if (role === 'member') {
    const memberId = req.user.member_id;
    if (!memberId) return res.json({ ...base, member: null });

    // Everything the member board needs, asked together instead of one by one.
    const [savings, loans, fines, share, nextMeeting, multiplierSetting, levySetting, owing] = await Promise.all([
      one(`SELECT COALESCE(SUM(amount),0)::float AS total, COALESCE(SUM(shares),0)::int AS shares,
                  COUNT(*)::int AS entries, MAX(date) AS last_date
             FROM savings WHERE member_id = $1 AND ($2::int IS NULL OR cycle_id = $2)`,
          [memberId, cycle ? cycle.id : null]),
      query(`SELECT l.*, COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
               FROM loans l WHERE l.member_id = $1 AND l.status IN ('pending','approved') ORDER BY l.id DESC`, [memberId]),
      one(`SELECT COALESCE(SUM(amount),0)::float AS unpaid FROM fines WHERE member_id = $1 AND paid = FALSE`, [memberId]),
      one(`SELECT d.share_amount::float AS share_amount, d.profit_share::float AS profit_share,
                  d.member_savings::float AS member_savings, so.status, so.date_distributed
             FROM share_out_details d JOIN share_out so ON so.id = d.share_out_id
            WHERE d.member_id = $1 ORDER BY so.id DESC LIMIT 1`, [memberId]),
      one(`SELECT meeting_date, meeting_time, location FROM meetings
            WHERE meeting_date >= CURRENT_DATE ORDER BY meeting_date LIMIT 1`),
      getSetting('loan_multiplier', '2'),
      getSetting('monthly_levy', '3000'),
      arrears(),
    ]);

    const activeLoan = loans.map((l) => {
      const { interest, totalDue } = loanTotals(l);
      return {
        ...l, amount: Number(l.amount), interest_amount: interest, total_due: totalDue,
        outstanding: Math.max(0, +(totalDue - l.total_repaid).toFixed(2)),
      };
    })[0] || null;

    const multiplier = Number(multiplierSetting);
    const levy = owing.all?.find((r) => r.member_id === memberId) || null;
    const levyAmount = Number(levySetting);

    return res.json({
      ...base,
      loan_limit: { multiplier, max_loan: +(Number(savings.total) * multiplier).toFixed(2) },
      wrappers: { monthly: levyAmount, owed: levy ? levy.owed : 0, paid: levy ? levy.paid : 0 },
      savings: { ...savings, total: Number(savings.total) },
      active_loan: activeLoan,
      unpaid_fines: fines.unpaid,
      my_share: share,
      next_meeting: nextMeeting,
    });
  }

  // ---------- Committee: admin, treasurer, secretary ----------
  // Every question this role needs goes out at the same moment. With the database
  // far away each trip costs about a third of a second, so asking one by one made
  // the board wait for 15 trips; asking together waits for about two.
  const wantsMoney = role === 'treasurer' || role === 'admin';
  const wantsPeople = role === 'secretary' || role === 'admin';
  const isAdmin = role === 'admin';

  const [
    money, memberStats, loanStats, welfare, fines, pendingJoins, nextMeeting,
    cashNow, outstandingRows, owing, monthPaid,
    recentSavings, pendingLoans, recentMeetings, attendance, recentActivity, system,
  ] = await Promise.all([
    one(`SELECT COALESCE((SELECT SUM(amount) FROM savings WHERE ($1::int IS NULL OR cycle_id = $1)),0)::float AS total_savings,
                COALESCE((SELECT SUM(amount) FROM loans WHERE status = 'approved'),0)::float AS loans_out,
                COALESCE((SELECT SUM(amount) FROM loan_repayments),0)::float AS repaid,
                COALESCE((SELECT SUM(interest_part) FROM loan_repayments),0)::float AS interest_earned`,
        [cycle ? cycle.id : null]),
    one(`SELECT COUNT(*) FILTER (WHERE status='active')::int AS active,
                COUNT(*) FILTER (WHERE status='inactive')::int AS inactive FROM members`),
    one(`SELECT COUNT(*) FILTER (WHERE status='pending')::int  AS pending,
                COUNT(*) FILTER (WHERE status='approved')::int AS approved,
                COUNT(*) FILTER (WHERE status='repaid')::int   AS repaid,
                COUNT(*) FILTER (WHERE status='rejected')::int AS rejected,
                COUNT(*) FILTER (WHERE status='approved' AND due_date < CURRENT_DATE)::int AS overdue
           FROM loans`),
    one(`SELECT (COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN type='payout' THEN amount ELSE 0 END),0))::float AS balance
           FROM welfare_fund`),
    one(`SELECT COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END),0)::float AS collected,
                COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END),0)::float AS outstanding FROM fines`),
    one(`SELECT COUNT(*)::int AS c FROM join_requests WHERE status = 'pending'`),
    one(`SELECT meeting_date, meeting_time, location FROM meetings WHERE meeting_date >= CURRENT_DATE ORDER BY meeting_date LIMIT 1`),

    // Cash sitting in the box right now.
    cashInBox(cycle ? cycle.id : null),
    query(
      `SELECT l.amount::float, l.with_interest, l.interest_rate::float,
              COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
         FROM loans l WHERE l.status = 'approved'`
    ),

    // The monthly wrappers money: collected this month, and who is behind.
    arrears(),
    one(
      `SELECT COALESCE(SUM(amount),0)::float AS v FROM monthly_contributions WHERE period = $1::date`,
      [`${currentMonth()}-01`]
    ),

    // The treasurer watches the money moving.
    wantsMoney ? query(
      `SELECT s.id, s.amount::float, s.date, u.full_name
         FROM savings s JOIN members m ON m.id = s.member_id JOIN users u ON u.id = m.user_id
        ORDER BY s.id DESC LIMIT 8`
    ) : null,
    wantsMoney ? query(
      `SELECT l.id, l.amount::float, l.with_interest, l.purpose, l.applied_at, u.full_name
         FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
        WHERE l.status = 'pending' ORDER BY l.applied_at LIMIT 8`
    ) : null,

    // The secretary watches the people and the record of what happened.
    wantsPeople ? query(
      `SELECT mt.id, mt.meeting_date, mt.location,
              (SELECT COUNT(*)::int FROM attendance a WHERE a.meeting_id = mt.id AND a.status='present') AS present_count
         FROM meetings mt ORDER BY mt.meeting_date DESC LIMIT 5`
    ) : null,
    wantsPeople ? one(
      `SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status='present') / NULLIF(COUNT(*),0)), 0)::int AS rate
         FROM attendance`
    ) : null,
    wantsPeople ? query(
      `SELECT a.action, a.details, a.created_at, u.full_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT 8`
    ) : null,

    // The admin also watches the system itself.
    isAdmin ? one(
      `SELECT (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS active_users,
              (SELECT COUNT(*)::int FROM users WHERE locked_until > NOW()) AS locked_users,
              (SELECT COUNT(*)::int FROM sms_notifications WHERE sent_at::date = CURRENT_DATE) AS sms_today,
              (SELECT COUNT(*)::int FROM sms_notifications WHERE status = 'failed') AS sms_failed`
    ) : null,
  ]);

  const outstanding = outstandingRows.reduce((sum, l) => {
    const { totalDue } = loanTotals(l);
    return sum + Math.max(0, totalDue - l.total_repaid);
  }, 0);

  const payload = {
    ...base,
    members: memberStats,
    loans: loanStats,
    money: {
      total_savings: money.total_savings,
      loans_out: money.loans_out,
      outstanding: +outstanding.toFixed(2),
      interest_earned: money.interest_earned,
      cash_in_box: cashNow,
      welfare_balance: welfare.balance,
      fines_collected: fines.collected,
      fines_outstanding: fines.outstanding,
    },
    pending_join_requests: pendingJoins.c,
    next_meeting: nextMeeting,
    wrappers: {
      month: currentMonth(), monthly: owing.levy,
      collected_this_month: monthPaid.v, expected_this_month: owing.levy * memberStats.active,
      behind_count: owing.rows.length, owed: owing.total_owed,
    },
  };

  if (wantsMoney) {
    payload.recent_savings = recentSavings;
    payload.pending_loans = pendingLoans;
  }
  if (wantsPeople) {
    payload.recent_meetings = recentMeetings;
    payload.attendance_rate = attendance.rate;
    payload.recent_activity = recentActivity;
  }
  if (isAdmin) payload.system = system;

  res.json(payload);
});

// The front page is the first thing every visitor loads, and its numbers move
// slowly, so the answer is remembered for 30 seconds.
let impactCache = { at: 0, data: null };

/** GET /api/public/impact — numbers for the front page. No money is shown. */
const publicImpact = wrap(async (req, res) => {
  if (impactCache.data && Date.now() - impactCache.at < 30 * 1000) return res.json(impactCache.data);

  const [members, loans, meetings, cycle, multiplier, rate, levy] = await Promise.all([
    one(`SELECT COUNT(*)::int AS total FROM members WHERE status = 'active'`),
    one(
      `SELECT COUNT(*) FILTER (WHERE status='approved')::int AS approved,
              COUNT(*) FILTER (WHERE status='repaid')::int   AS repaid,
              COUNT(*)::int AS total FROM loans`
    ),
    one(`SELECT COUNT(*)::int AS c FROM meetings`),
    getActiveCycle(),
    getSetting('loan_multiplier', '2'),
    getSetting('default_interest_rate', '10'),
    getSetting('monthly_levy', '3000'),
  ]);

  const completed = loans.approved + loans.repaid;
  const recoveryRate = completed > 0 ? Math.round((loans.repaid / completed) * 100) : 0;

  let weeksElapsed = 0;
  let weeksTotal = 52;
  if (cycle) {
    const start = new Date(cycle.start_date);
    const end = new Date(cycle.end_date);
    weeksTotal = Math.max(1, Math.round((end - start) / (7 * 86400000)));
    weeksElapsed = Math.min(weeksTotal, Math.max(0, Math.round((Date.now() - start) / (7 * 86400000))));
  }

  const data = {
    active_members: members.total,
    loans_given: loans.total,
    loans_repaid: loans.repaid,
    recovery_rate: recoveryRate,
    meetings_held: meetings.c,
    loan_multiplier: Number(multiplier),
    interest_rate: Number(rate),
    monthly_levy: Number(levy),
    cycle_name: cycle ? cycle.cycle_name : null,
    weeks_elapsed: weeksElapsed,
    weeks_total: weeksTotal,
  };
  impactCache = { at: Date.now(), data };
  res.json(data);
});

module.exports = { getDashboard, publicImpact };