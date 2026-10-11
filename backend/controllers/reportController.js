const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { loanTotals } = require('../utils/helpers');

// The register only ever shows one status at a time: someone who missed the
// meeting, or someone who said beforehand that they could not come.
const wantedStatus = (v) => (v === 'excused' ? 'excused' : 'absent');

/**
 * One line for every meeting somebody missed.
 * GET /api/reports/absentees?status=&from=&to=&cycleId=&memberId=
 */
const listAbsentees = wrap(async (req, res) => {
  const params = [wantedStatus(req.query.status)];
  const where = ['a.status = $1'];
  let idx = 2;

  if (req.query.cycleId) { params.push(req.query.cycleId); where.push(`mt.cycle_id = $${idx++}`); }
  if (req.query.memberId) { params.push(req.query.memberId); where.push(`a.member_id = $${idx++}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`mt.meeting_date >= $${idx++}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`mt.meeting_date <= $${idx++}`); }

  const rows = await query(
    `SELECT a.id, a.status, a.meeting_id, a.member_id,
            mt.meeting_date, mt.agenda,
            m.membership_number, u.full_name,
            c.id AS cycle_id, c.cycle_name,
            (SELECT COUNT(1)::int
               FROM fines f
              WHERE f.member_id = a.member_id
                AND f.date = mt.meeting_date
                AND f.paid = FALSE) AS unpaid_fines_on_date
       FROM attendance a
       JOIN meetings mt ON mt.id = a.meeting_id
       JOIN members  m  ON m.id  = a.member_id
       JOIN users    u  ON u.id  = m.user_id
       LEFT JOIN cycles c ON c.id = mt.cycle_id
      WHERE ${where.join(' AND ')}
      ORDER BY mt.meeting_date DESC, u.full_name`,
    params
  );
  res.json(rows);
});

/**
 * The same absences rolled up per member: how often, how often lately, last time.
 * GET /api/reports/absentee-register?status=&from=&to=&cycleId=&memberId=
 */
const listAbsenteeRegister = wrap(async (req, res) => {
  const params = [wantedStatus(req.query.status)];
  const where = ['a.status = $1'];
  let idx = 2;

  if (req.query.cycleId) { params.push(req.query.cycleId); where.push(`mt.cycle_id = $${idx++}`); }
  if (req.query.memberId) { params.push(req.query.memberId); where.push(`a.member_id = $${idx++}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`mt.meeting_date >= $${idx++}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`mt.meeting_date <= $${idx++}`); }

  const rows = await query(
    `SELECT m.id AS member_id, m.membership_number, u.full_name,
            COUNT(1)::int AS total_absences,
            (COUNT(1) FILTER (WHERE mt.meeting_date >= CURRENT_DATE - INTERVAL '30 days'))::int AS absences_last_30,
            MAX(mt.meeting_date) AS last_absence_date
       FROM attendance a
       JOIN meetings mt ON mt.id = a.meeting_id
       JOIN members  m  ON m.id  = a.member_id
       JOIN users    u  ON u.id  = m.user_id
      WHERE ${where.join(' AND ')}
      GROUP BY m.id, m.membership_number, u.full_name
      ORDER BY total_absences DESC, u.full_name`,
    params
  );
  res.json(rows);
});

/**
 * Everything recorded for one member in a chosen year and/or month:
 * savings, monthly wrappers, loans and fines — with the totals to match.
 * GET /api/reports/member/:id?year=&month=
 */
const memberReport = wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Choose a member.' });

  const year = /^\d{4}$/.test(String(req.query.year || '')) ? Number(req.query.year) : null;
  const month = /^\d{1,2}$/.test(String(req.query.month || '')) ? Number(req.query.month) : null;
  if (month && (month < 1 || month > 12)) return res.status(400).json({ message: 'Choose a month from 1 to 12.' });

  const member = await one(
    `SELECT m.id, m.membership_number, m.status, m.village, m.date_joined,
            u.full_name, u.phone
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1`,
    [id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not on the list.' });

  // The window the report covers. No year at all means everything on record.
  let from = null;
  let to = null;
  if (year && month) {
    from = `${year}-${String(month).padStart(2, '0')}-01`;
    to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  } else if (year) {
    from = `${year}-01-01`;
    to = `${year + 1}-01-01`;
  }

  const [savings, contributions, loanRows, fines] = await Promise.all([
    query(
      `SELECT id, amount::float, shares, date, note FROM savings
        WHERE member_id = $1
          AND ($2::date IS NULL OR date >= $2::date)
          AND ($3::date IS NULL OR date < $3::date)
        ORDER BY date DESC, id DESC`,
      [id, from, to]
    ),
    query(
      `SELECT id, TO_CHAR(period, 'YYYY-MM') AS period, amount::float, paid_on
         FROM monthly_contributions
        WHERE member_id = $1
          AND ($2::date IS NULL OR period >= $2::date)
          AND ($3::date IS NULL OR period < $3::date)
        ORDER BY period DESC, id DESC`,
      [id, from, to]
    ),
    query(
      `SELECT l.id, l.amount::float, l.with_interest, l.interest_rate::float, l.status,
              l.due_date, l.purpose, l.applied_at,
              COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0)::float AS total_repaid
         FROM loans l
        WHERE l.member_id = $1
          AND ($2::date IS NULL OR l.applied_at >= $2::date)
          AND ($3::date IS NULL OR l.applied_at < $3::date)
        ORDER BY l.id DESC`,
      [id, from, to]
    ),
    query(
      `SELECT id, amount::float, reason, paid, date FROM fines
        WHERE member_id = $1
          AND ($2::date IS NULL OR date >= $2::date)
          AND ($3::date IS NULL OR date < $3::date)
        ORDER BY date DESC, id DESC`,
      [id, from, to]
    ),
  ]);

  const loans = loanRows.map((l) => {
    const { interest, totalDue } = loanTotals(l);
    return { ...l, interest_amount: interest, total_due: totalDue,
             outstanding: Math.max(0, +(totalDue - l.total_repaid).toFixed(2)) };
  });

  const sum = (rows, pick) => +rows.reduce((a, r) => a + Number(pick(r) || 0), 0).toFixed(2);
  const savingsTotal = sum(savings, (r) => r.amount);
  const sharesTotal = savings.reduce((a, r) => a + Number(r.shares || 0), 0);
  const loansOutstanding = +loans.filter((l) => l.status === 'approved')
    .reduce((a, l) => a + l.outstanding, 0).toFixed(2);
  const finesUnpaid = sum(fines.filter((f) => !f.paid), (r) => r.amount);

  res.json({
    member,
    period: { year, month, from, to },
    savings,
    contributions,
    loans,
    fines,
    totals: {
      savings: savingsTotal,
      shares: sharesTotal,
      contributions: sum(contributions, (r) => r.amount),
      loans_given: sum(loans, (r) => r.amount),
      loans_outstanding: loansOutstanding,
      fines: sum(fines, (r) => r.amount),
      fines_unpaid: finesUnpaid,
      // What is really still hers right now: savings less what she owes.
      net: +(savingsTotal - loansOutstanding - finesUnpaid).toFixed(2),
    },
  });
});

// ---- group report helpers --------------------------------------------------

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

// The bucket starts, plus the overall window, for the chosen granularity.
const buildWindow = (granularity, year, month, today) => {
  if (granularity === 'week') {
    let from;
    let to;
    if (month) {
      const mStart = `${year}-${String(month).padStart(2, '0')}-01`;
      to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      from = mondayOf(mStart);
    } else {
      from = mondayOf(`${year}-01-01`);
      to = year === Number(today.slice(0, 4)) ? addDays(today, 1) : `${year + 1}-01-01`;
    }
    const starts = [];
    for (let s = from; s < to; s = addDays(s, 7)) starts.push(s);
    return { starts, from, to, trunc: 'week' };
  }
  if (granularity === 'year') {
    const cy = Number(today.slice(0, 4));
    return {
      starts: Array.from({ length: 6 }, (_, i) => `${cy - 5 + i}-01-01`),
      from: `${cy - 5}-01-01`, to: `${cy + 1}-01-01`, trunc: 'year',
    };
  }
  return {
    starts: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`),
    from: `${year}-01-01`, to: `${year + 1}-01-01`, trunc: 'month',
  };
};

const bucketLabel = (start, granularity) => {
  const d = new Date(`${start}T00:00:00Z`);
  if (granularity === 'year') return String(d.getUTCFullYear());
  if (granularity === 'week') return `${d.getUTCDate()} ${monthShort.format(d)}`;
  return monthShort.format(d);
};

/**
 * The whole group, by week, month or year: how contributions, loans, fines,
 * welfare, savings and repayments move, with the detail lists to match.
 * GET /api/reports/group?granularity=month&year=2026
 */
const groupReport = wrap(async (req, res) => {
  const granularity = ['week', 'year'].includes(req.query.granularity) ? req.query.granularity : 'month';
  const year = /^\d{4}$/.test(String(req.query.year || '')) ? Number(req.query.year) : new Date().getFullYear();
  const month = /^\d{1,2}$/.test(String(req.query.month || '')) ? Number(req.query.month) : null;
  const today = new Date().toISOString().slice(0, 10);
  const { starts, from, to, trunc } = buildWindow(granularity, year, month, today);

  const series = async (table, col, extra = '') => {
    const rows = await query(
      `SELECT to_char(date_trunc('${trunc}', ${col}::timestamp), 'YYYY-MM-DD') AS b,
              COALESCE(SUM(amount),0)::float AS v
         FROM ${table}
        WHERE ${col} >= $1::date AND ${col} < $2::date ${extra}
        GROUP BY 1`,
      [from, to]
    );
    return Object.fromEntries(rows.map((r) => [r.b, Number(r.v)]));
  };

  const [contrib, loans, fines, wIn, wOut, savings, repay] = await Promise.all([
    series('monthly_contributions', 'paid_on'),
    series('loans', 'decided_at', "AND status IN ('approved','repaid','defaulted')"),
    series('fines', 'date'),
    series('welfare_fund', 'date', "AND type = 'contribution'"),
    series('welfare_fund', 'date', "AND type = 'payout'"),
    series('savings', 'date'),
    series('loan_repayments', 'date'),
  ]);

  const round = (n) => +Number(n || 0).toFixed(2);
  const at = (map, s) => round(map[s]);
  const buckets = starts.map((s) => ({
    start: s,
    label: bucketLabel(s, granularity),
    contributions: at(contrib, s),
    loans: at(loans, s),
    fines: at(fines, s),
    welfare: round((wIn[s] || 0) - (wOut[s] || 0)),
    savings: at(savings, s),
    repayments: at(repay, s),
  }));

  const totals = buckets.reduce((acc, b) => ({
    contributions: round(acc.contributions + b.contributions),
    loans: round(acc.loans + b.loans),
    fines: round(acc.fines + b.fines),
    welfare: round(acc.welfare + b.welfare),
    savings: round(acc.savings + b.savings),
    repayments: round(acc.repayments + b.repayments),
  }), { contributions: 0, loans: 0, fines: 0, welfare: 0, savings: 0, repayments: 0 });

  const [contributionsByMember, loansList, finesList] = await Promise.all([
    query(
      `SELECT u.full_name, COALESCE(SUM(mc.amount),0)::float AS total
         FROM monthly_contributions mc
         JOIN members m ON m.id = mc.member_id
         JOIN users u ON u.id = m.user_id
        WHERE mc.paid_on >= $1::date AND mc.paid_on < $2::date
        GROUP BY u.full_name ORDER BY total DESC`,
      [from, to]
    ),
    query(
      `SELECT l.id, u.full_name, l.amount::float, l.status, l.with_interest, l.interest_rate::float,
              l.applied_at, to_char(l.due_date,'YYYY-MM-DD') AS due_date,
              COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
         FROM loans l
         JOIN members m ON m.id = l.member_id
         JOIN users u ON u.id = m.user_id
        WHERE l.applied_at >= $1::date AND l.applied_at < $2::date
        ORDER BY l.id DESC`,
      [from, to]
    ),
    query(
      `SELECT f.id, u.full_name, f.amount::float, f.paid, f.reason,
              to_char(f.date,'YYYY-MM-DD') AS date
         FROM fines f
         JOIN members m ON m.id = f.member_id
         JOIN users u ON u.id = m.user_id
        WHERE f.date >= $1::date AND f.date < $2::date
        ORDER BY f.date DESC, f.id DESC`,
      [from, to]
    ),
  ]);

  res.json({
    granularity, year, from, to, buckets, totals,
    contributionsByMember,
    loans: loansList.map((l) => {
      const { totalDue } = loanTotals(l);
      return { ...l, outstanding: Math.max(0, +(totalDue - l.total_repaid).toFixed(2)) };
    }),
    fines: finesList,
  });
});

module.exports = { listAbsentees, listAbsenteeRegister, memberReport, groupReport };
