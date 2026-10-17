const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { getActiveCycle, loanTotals, cashInBox, getSetting } = require('../utils/helpers');
const { arrears, currentMonth, monthsBetween } = require('../utils/wrappers');

const round = (n) => +Number(n || 0).toFixed(2);

// The last six calendar months, oldest first, for the cash-flow charts.
function sixMonths() {
  const now = currentMonth();
  const [ny, nm] = now.split('-').map(Number);
  const first = new Date(ny, nm - 6, 1);
  const from = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, months: monthsBetween(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`, now) };
}

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
    const [savings, loans, fines, finesList, share, nextMeeting, multiplierSetting, levySetting, owing,
           groupMoney, groupLoans, groupCash, recentContrib] = await Promise.all([
      one(`SELECT COALESCE(SUM(amount),0)::float AS total, COALESCE(SUM(shares),0)::int AS shares,
                  COUNT(*)::int AS entries, MAX(date) AS last_date
             FROM savings WHERE member_id = $1 AND ($2::int IS NULL OR cycle_id = $2)`,
          [memberId, cycle ? cycle.id : null]),
      query(`SELECT l.*, COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
               FROM loans l WHERE l.member_id = $1 AND l.status IN ('pending','approved') ORDER BY l.id DESC`, [memberId]),
      one(`SELECT COALESCE(SUM(amount),0)::float AS unpaid FROM fines WHERE member_id = $1 AND paid = FALSE`, [memberId]),
      query(
        `SELECT f.id, f.amount::float, f.reason, f.paid, f.date, f.meeting_id,
                to_char(f.date,'YYYY-MM') AS month, c.cycle_name, mt.meeting_date
           FROM fines f
           LEFT JOIN cycles c ON c.id = f.cycle_id
           LEFT JOIN meetings mt ON mt.id = f.meeting_id
          WHERE f.member_id = $1 ORDER BY f.date DESC, f.id DESC LIMIT 20`, [memberId]),
      one(`SELECT d.share_amount::float AS share_amount, d.profit_share::float AS profit_share,
                  d.member_savings::float AS member_savings, so.status, so.date_distributed
             FROM share_out_details d JOIN share_out so ON so.id = d.share_out_id
            WHERE d.member_id = $1 ORDER BY so.id DESC LIMIT 1`, [memberId]),
      one(`SELECT meeting_date, meeting_time, location FROM meetings
            WHERE meeting_date >= CURRENT_DATE ORDER BY meeting_date LIMIT 1`),
      getSetting('loan_multiplier', '2'),
      getSetting('monthly_levy', '3000'),
      arrears(),

      // The whole group's money, so the box is not a mystery to the women who fill it.
      one(`SELECT COALESCE((SELECT SUM(amount) FROM savings WHERE ($1::int IS NULL OR cycle_id = $1)),0)::float AS total_savings,
                  COALESCE((SELECT SUM(interest_part) FROM loan_repayments),0)::float AS interest_earned`,
        [cycle ? cycle.id : null]),
      query(`SELECT l.amount::float, l.with_interest, l.interest_rate::float,
                    COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
               FROM loans l WHERE l.status = 'approved'`),
      cashInBox(cycle ? cycle.id : null),
      query(`SELECT s.id, s.amount::float, s.date, u.full_name
               FROM savings s JOIN members m ON m.id = s.member_id JOIN users u ON u.id = m.user_id
              ORDER BY s.id DESC LIMIT 6`),
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

    // Her savings month by month (six months), for the little trend picture.
    const { from, months } = sixMonths();
    const [trendBuckets, recentEntries] = await Promise.all([
      query(
        `SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v
           FROM savings WHERE member_id = $1 AND date >= $2::date GROUP BY 1`,
        [memberId, from]
      ),
      query(
        `SELECT id, amount::float, shares, note, date FROM savings
          WHERE member_id = $1 ORDER BY date DESC, id DESC LIMIT 4`,
        [memberId]
      ),
    ]);
    const trend = Object.fromEntries(trendBuckets.map((r) => [r.ym, r.v]));
    const savings_trend = months.map((ym) => ({ month: ym, amount: round(trend[ym]) }));

    const groupOutstanding = groupLoans.reduce((sum, l) => {
      const { totalDue } = loanTotals(l);
      return sum + Math.max(0, totalDue - l.total_repaid);
    }, 0);

    return res.json({
      ...base,
      loan_limit: { multiplier, max_loan: +(Number(savings.total) * multiplier).toFixed(2) },
      wrappers: { monthly: levyAmount, owed: levy ? levy.owed : 0, paid: levy ? levy.paid : 0 },
      savings: { ...savings, total: Number(savings.total) },
      active_loan: activeLoan,
      unpaid_fines: fines.unpaid,
      my_fines: finesList,
      my_share: share,
      next_meeting: nextMeeting,
      savings_trend,
      recent_savings: recentEntries,
      money: {
        total_savings: groupMoney.total_savings,
        interest_earned: groupMoney.interest_earned,
        outstanding: +groupOutstanding.toFixed(2),
        cash_in_box: groupCash,
      },
      recent_contributions: recentContrib,
    });
  }

  // ---------- System administrator ----------
  // She looks after the accounts and the system itself. No money is ever shown.
  if (role === 'system_admin') {
    const [people, locked, pendingChanges, pendingJoins, smsToday, failedLogins, smsFailed, systemRows, recent] = await Promise.all([
      one(`SELECT COUNT(*) FILTER (WHERE role='admin')::int       AS chairpersons,
                  COUNT(*) FILTER (WHERE role='treasurer')::int   AS treasurers,
                  COUNT(*) FILTER (WHERE role='secretary')::int   AS secretaries,
                  COUNT(*) FILTER (WHERE role='system_admin')::int AS administrators,
                  COUNT(*) FILTER (WHERE role='member')::int      AS members,
                  COUNT(*) FILTER (WHERE is_active = TRUE)::int   AS active,
                  COUNT(*)::int                                   AS total FROM users`),
      one(`SELECT COUNT(*)::int AS c FROM users WHERE locked_until > NOW()`),
      one(`SELECT COUNT(*)::int AS c FROM change_requests WHERE status = 'pending'`),
      one(`SELECT COUNT(*)::int AS c FROM join_requests WHERE status = 'pending'`),
      one(`SELECT COUNT(*)::int AS c FROM sms_notifications WHERE sent_at::date = CURRENT_DATE`),
      // Log-ins that ended in a lockout over the last seven days.
      one(`SELECT COUNT(*)::int AS c FROM audit_logs
            WHERE action = 'LOGIN_LOCKED' AND created_at >= NOW() - INTERVAL '7 days'`),
      one(`SELECT COUNT(*)::int AS c FROM sms_notifications WHERE status = 'failed'`),
      query(`SELECT setting_key, setting_value FROM settings WHERE setting_key = ANY($1)`,
        [['session_timeout_minutes', 'max_login_attempts', 'lock_minutes', 'reset_max_tries', 'sms_enabled']]),
      query(`SELECT a.action, a.details, a.created_at, u.full_name
               FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.action IN ('LOGIN','LOGIN_LOCKED','LOGOUT','PASSWORD_RESET','ADMIN_RESET_PASSWORD',
                                 'PASSWORD_RESET_FAILED','PASSWORD_RESET_BLOCKED')
              ORDER BY a.created_at DESC LIMIT 8`),
    ]);

    const system_settings = Object.fromEntries(systemRows.map((r) => [r.setting_key, r.setting_value]));

    return res.json({
      ...base,
      users: { ...people, locked: locked.c },
      pending_change_requests: pendingChanges.c,
      pending_join_requests: pendingJoins.c,
      sms_today: smsToday.c,
      failed_logins_7d: failedLogins.c,
      sms: {
        enabled: String(system_settings.sms_enabled).toLowerCase() !== 'false',
        configured: !!process.env.TEXTBEE_API_KEY,
        failed: smsFailed.c,
      },
      system_settings,
      recent_activity: recent,
    });
  }

  // ---------- Committee: admin, treasurer, secretary ----------
  // Every question this role needs goes out at the same moment. With the database
  // far away each trip costs about a third of a second, so asking one by one made
  // the board wait for 15 trips; asking together waits for about two.
  const wantsMoney = role === 'treasurer' || role === 'admin';
  const wantsPeople = role === 'secretary' || role === 'admin';
  const isAdmin = role === 'admin';
  const { from: flowFrom, months: flowMonths } = sixMonths();

  const [
    money, memberStats, loanStats, welfare, fines, pendingJoins, nextMeeting,
    cashNow, outstandingRows, owing, monthPaid,
    recentSavings, pendingLoans, recentMeetings, attendance, recentActivity, system,
    monthlyFlow, todayTick, contribMonthly, expectedFines,
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
    one(`SELECT COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE 0 END),0)::float AS contributions,
                COALESCE(SUM(CASE WHEN type='payout' THEN amount ELSE 0 END),0)::float AS payouts
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
              (SELECT COUNT(*)::int FROM attendance a WHERE a.meeting_id = mt.id AND a.status='present') AS present_count,
              (SELECT COUNT(*)::int FROM attendance a WHERE a.meeting_id = mt.id) AS marked
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

    // The money crew charts what has been coming in for the last six months.
    wantsMoney ? Promise.all([
      query(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM savings
              WHERE date >= $1::date GROUP BY 1`, [flowFrom]),
      query(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM loan_repayments
              WHERE date >= $1::date GROUP BY 1`, [flowFrom]),
      query(`SELECT to_char(decided_at,'YYYY-MM') AS ym, SUM(amount)::float AS v FROM loans
              WHERE status IN ('approved','repaid','defaulted') AND decided_at >= $1::date GROUP BY 1`, [flowFrom]),
    ]) : null,

    // What moved today, for the treasurer's opening line.
    wantsMoney ? one(
      `SELECT COALESCE((SELECT SUM(amount)::float FROM savings WHERE date::date = CURRENT_DATE),0) AS saved,
              COALESCE((SELECT SUM(amount)::float FROM loan_repayments WHERE date::date = CURRENT_DATE),0) AS repaid,
              COALESCE((SELECT SUM(amount)::float FROM fines WHERE paid = TRUE AND date::date = CURRENT_DATE),0) AS fines_paid`
    ) : null,

    // This year's monthly levy contributions, one figure per calendar month.
    wantsMoney ? query(
      `SELECT to_char(period,'YYYY-MM') AS ym, SUM(amount)::float AS v
         FROM monthly_contributions
        WHERE period >= $1::date AND period < ($1::date + interval '1 year')
        GROUP BY 1`, [`${currentMonth().slice(0, 4)}-01-01`]
    ) : null,

    // Fines still waiting to be paid, with the meeting and cycle they belong to.
    query(
      `SELECT f.id, f.amount::float, f.date, f.meeting_id, f.member_id,
              to_char(f.date,'YYYY-MM') AS month,
              u.full_name, (m.avatar IS NOT NULL) AS has_avatar,
              c.cycle_name, mt.meeting_date
         FROM fines f
         JOIN members m ON m.id = f.member_id
         JOIN users u ON u.id = m.user_id
         LEFT JOIN cycles c ON c.id = f.cycle_id
         LEFT JOIN meetings mt ON mt.id = f.meeting_id
        WHERE f.paid = FALSE
        ORDER BY f.date DESC, f.id DESC LIMIT 25`
    ),
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
      welfare_balance: round(welfare.contributions - welfare.payouts),
      welfare_in: welfare.contributions,
      welfare_out: welfare.payouts,
      fines_collected: fines.collected,
      fines_outstanding: fines.outstanding,
    },
    pending_join_requests: pendingJoins.c,
    expected_fines: expectedFines,
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
    payload.today = {
      saved: todayTick?.saved || 0, repaid: todayTick?.repaid || 0,
      fines_paid: todayTick?.fines_paid || 0,
    };
    if (monthlyFlow) {
      const by = (rows) => Object.fromEntries(rows.map((r) => [r.ym, r.v]));
      const [savBy, repBy, giveBy] = monthlyFlow.map((rows) => by(rows || []));
      payload.monthly_flow = flowMonths.map((ym) => ({
        month: ym, savings: round(savBy[ym]), repayments: round(repBy[ym]), loans_given: round(giveBy[ym]),
      }));
    }

    // This year's monthly figures for the contribution overview, starting July.
    const year = currentMonth().slice(0, 4);
    const startYm = `${year}-07` <= currentMonth() ? `${year}-07` : currentMonth();
    const contribBy = Object.fromEntries((contribMonthly || []).map((r) => [r.ym, r.v]));
    payload.contributions_by_month = monthsBetween(startYm, currentMonth()).map((ym) => ({
      month: ym, amount: round(contribBy[ym]),
    }));
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

  const [members, loans, meetings, cycle, multiplier, rate, levy, fee] = await Promise.all([
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
    getSetting('registration_fee', '1000'),
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
    registration_fee: Number(fee),
    cycle_name: cycle ? cycle.cycle_name : null,
    weeks_elapsed: weeksElapsed,
    weeks_total: weeksTotal,
  };
  impactCache = { at: Date.now(), data };
  res.json(data);
});

module.exports = { getDashboard, publicImpact };