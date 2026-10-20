const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { emit, EVENTS } = require('../utils/events');
const { getActiveCycle, getSetting, loanTotals, cashInBox } = require('../utils/helpers');

const withBalance = (loan) => {
  const { interest, totalDue } = loanTotals(loan);
  const repaid = Number(loan.total_repaid || 0);
  return {
    ...loan,
    amount: Number(loan.amount),
    interest_rate: Number(loan.interest_rate),
    interest_amount: interest,
    total_due: totalDue,
    total_repaid: repaid,
    outstanding: Math.max(0, +(totalDue - repaid).toFixed(2)),
  };
};

// A loan runs for three months. These helpers work in whole calendar days so a
// date never slips a day through a timezone change.
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const threeMonthsFrom = (d) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 3);
  return x;
};
// A three-month term, but never past the day the cycle closes: the money must
// be back in the box before the cycle ends. If the cycle ends sooner, the loan
// simply runs for the shorter time.
const dueWithinCycle = (cycleEnd) => {
  const three = threeMonthsFrom(new Date());
  if (cycleEnd && three > new Date(cycleEnd)) return new Date(cycleEnd);
  return three;
};

// GET /api/loans/limit?member_id=  — how much she may borrow, and why
const borrowingLimit = wrap(async (req, res) => {
  const memberId = req.user.role === 'member' ? req.user.member_id : Number(req.query.member_id);
  const multiplier = Number(await getSetting('loan_multiplier', '2'));
  const rate = Number(await getSetting('default_interest_rate', '10'));
  if (!memberId) return res.json({ multiplier, interest_rate: rate, savings: 0, max_loan: 0, open_loan: null });

  const activeCycle = await getActiveCycle();
  const savings = (await one(
    `SELECT COALESCE(SUM(amount),0)::float AS total FROM savings
      WHERE member_id = $1 AND cycle_id = $2 AND status = 'verified'`,
    [memberId, activeCycle ? activeCycle.id : null]
  )).total;
  const open = await one(
    `SELECT id, status FROM loans WHERE member_id = $1
      AND status IN ('pending','approved','pending_verification','verified') LIMIT 1`, [memberId]
  );
  res.json({
    multiplier, interest_rate: rate, savings,
    max_loan: +(savings * multiplier).toFixed(2), open_loan: open,
  });
});

// POST /api/loans — a member borrows from the group's own money
const applyLoan = wrap(async (req, res) => {
  const { member_id, amount, with_interest = true, purpose } = req.body;

  // A member may only borrow for herself; the committee may file on her behalf.
  const borrowerId = req.user.role === 'member' ? req.user.member_id : Number(member_id);
  if (!borrowerId) return res.status(400).json({ message: 'Choose who the loan is for.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Enter an amount above zero.' });

  const member = await one(
    `SELECT m.id, u.full_name, u.phone, u.language
       FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`,
    [borrowerId]
  );
  if (!member) return res.status(404).json({ message: 'That member is not active.' });

  const openLoan = await one(
    `SELECT id, status FROM loans WHERE member_id = $1
      AND status IN ('pending','approved','pending_verification','verified')`,
    [borrowerId]
  );
  if (openLoan) {
    const waiting = openLoan.status === 'pending';
    return res.status(400).json({
      message: waiting
        ? 'There is already a loan request waiting for the committee.'
        : 'This loan must be repaid before borrowing again.',
    });
  }

  const cycle = await getActiveCycle();
  if (!cycle) return res.status(400).json({ message: 'No saving cycle is running.' });

  const savingsRow = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS total FROM savings
      WHERE member_id = $1 AND cycle_id = $2 AND status = 'verified'`,
    [borrowerId, cycle.id]
  );
  const totalSavings = savingsRow.total;
  if (totalSavings <= 0) {
    return res.status(400).json({ message: 'This member has not saved anything yet, so a loan is not possible.' });
  }

  const multiplier = Number(await getSetting('loan_multiplier', '2'));
  const maxLoan = +(totalSavings * multiplier).toFixed(2);
  if (Number(amount) > maxLoan) {
    return res.status(400).json({
      message: `The most that can be borrowed is ${maxLoan.toLocaleString()} — ${multiplier} times the savings of ${totalSavings.toLocaleString()}.`,
      max_allowed: maxLoan, member_savings: totalSavings,
    });
  }

  // A loan runs three months from the day it is given, but never past the day
  // the cycle closes. Until it is approved the request carries a provisional
  // due date; approval sets the final one.
  const due = dueWithinCycle(cycle.end_date);

  const defaultRate = Number(await getSetting('default_interest_rate', '10'));
  const carriesInterest = with_interest !== false && String(with_interest) !== 'false';

  const loan = await one(
    `INSERT INTO loans (member_id, cycle_id, amount, with_interest, interest_rate, purpose, due_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
   [borrowerId, cycle.id, amount, carriesInterest, carriesInterest ? defaultRate : 0,
   purpose || null, ymd(due)]
  );

  await emit(EVENTS.LOAN_APPLIED, { recordedBy: req.user.id, member, loan });

  res.status(201).json({
    message: 'Loan request sent to the committee.',
    loan: withBalance({ ...loan, total_repaid: 0 }),
    max_allowed: maxLoan, member_savings: totalSavings,
  });
});

// PATCH /api/loans/:id/decision  { status: 'approved' | 'rejected', note }
// The chairperson settles the committee's decision. Approving means the request
// is authorised, nothing more: no money has left the box yet. The treasurer
// records the money leaving, then the secretary checks it. That separation is
// the whole point.
const decideLoan = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { status, note } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'The decision must be approved or rejected.' });
  }

  const outcome = await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(7001)');
    const run = async (text, params) => (await client.query(text, params)).rows;

    const loan = (await run(
      `SELECT l.*, u.full_name, u.phone, u.language
         FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
        WHERE l.id = $1 FOR UPDATE OF l`,
      [id]
    ))[0];
    if (!loan) return { code: 404, message: 'That loan request does not exist.' };
    if (loan.status !== 'pending') return { code: 400, message: 'That request has already been decided.' };

    // Separation of powers: nobody approves their own loan. A treasurer who is
    // also a member applies like anyone else, and another officer decides it.
    if (req.user.member_id && Number(loan.member_id) === Number(req.user.member_id)) {
      return { code: 403, message: 'You cannot decide your own loan request.' };
    }

    await client.query(
      `UPDATE loans SET status = $2, decision_note = $3, decided_at = NOW(), approved_by = $4
        WHERE id = $1`,
      [id, status, note || null, req.user.id]
    );
    return { loan };
  });

  if (outcome.code) return res.status(outcome.code).json({ message: outcome.message });
  const loan = outcome.loan;

  const [sms] = await emit(EVENTS.LOAN_DECIDED, {
    decidedBy: req.user.id, loan, status, note,
  });

  res.json({
    message: status === 'approved'
      ? `Loan approved. The treasurer will record the money leaving the box. ${loan.full_name} has been told.`
      : `Loan turned down. ${loan.full_name} has been told.`,
    sms_sent: !!(sms && sms.ok),
  });
});

// PATCH /api/loans/:id/record — the treasurer writes down the money leaving the
// box. The loan becomes pending_verification: the cash is out, but it is not
// live and takes no repayments until the secretary has checked it.
const recordLoan = wrap(async (req, res) => {
  const id = Number(req.params.id);

  const outcome = await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(7001)');
    const run = async (text, params) => (await client.query(text, params)).rows;

    const loan = (await run(
      `SELECT l.*, u.full_name, u.phone, u.language
         FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
        WHERE l.id = $1 FOR UPDATE OF l`,
      [id]
    ))[0];
    if (!loan) return { code: 404, message: 'That loan does not exist.' };
    if (loan.status === 'pending') {
      return { code: 400, message: 'This request has not been approved by the chairperson yet.' };
    }
    if (loan.status !== 'approved') {
      return { code: 400, message: 'Only an approved loan can have its money recorded.' };
    }

    // The box is checked at the moment the money actually leaves, inside the
    // same locked transaction, so two people recording at once cannot lend the
    // same money twice.
    const available = await cashInBox(loan.cycle_id, run);
    if (Number(loan.amount) > available) {
      return {
        code: 400, available,
        message: `The box only has ${available.toLocaleString()} available. That is less than this loan.`,
      };
    }

    // The loan runs three months from the day it is given, but never past the
    // day the cycle closes.
    const [cycle] = await run(`SELECT end_date FROM cycles WHERE id = $1`, [loan.cycle_id]);
    const due = ymd(dueWithinCycle(cycle && cycle.end_date));

    await client.query(
      `UPDATE loans SET status = 'pending_verification', recorded_by = $2, recorded_at = NOW(),
              due_date = $3
        WHERE id = $1`,
      [id, req.user.id, due]
    );
    return { loan: { ...loan, due_date: due } };
  });

  if (outcome.code) return res.status(outcome.code).json({ message: outcome.message, available: outcome.available });

  await audit(req.user.id, 'RECORD_LOAN', 'loans', id,
    `${outcome.loan.full_name}: ${outcome.loan.amount} money recorded; awaiting verification`,
    { previous: 'approved', next: 'pending_verification' });

  res.json({ message: 'Loan money recorded. Waiting for the secretary to verify.' });
});

// PATCH /api/loans/:id/verify — the secretary checks that the money recorded
// leaving the box agrees with the approval. The loan is then live.
const verifyLoan = wrap(async (req, res) => {
  const id = Number(req.params.id);

  const loan = await one(
    `SELECT l.*, u.full_name, u.phone, u.language
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.id = $1`,
    [id]
  );
  if (!loan) return res.status(404).json({ message: 'That loan does not exist.' });
  if (loan.status === 'verified') return res.status(400).json({ message: 'This loan is already verified.' });
  if (loan.status !== 'pending_verification') {
    return res.status(400).json({ message: 'Only a recorded loan can be verified.' });
  }

  // Nobody checks their own hand: the treasurer recorded the money, so she
  // cannot be the one to verify it.
  if (Number(loan.recorded_by) === Number(req.user.id)) {
    return res.status(403).json({ message: 'You cannot verify a loan you recorded yourself.' });
  }

  await query(
    `UPDATE loans SET status = 'verified', verified_by = $2, verified_at = NOW(), rejected_reason = NULL
      WHERE id = $1`,
    [id, req.user.id]
  );

  const verified = withBalance({ ...loan, status: 'verified', total_repaid: 0 });
  const [sms] = await emit(EVENTS.LOAN_DECIDED, {
    decidedBy: req.user.id, loan: { ...loan, status: 'verified' }, status: 'approved', note: null,
  });

  await audit(req.user.id, 'VERIFY_LOAN', 'loans', id,
    `${loan.full_name}: ${loan.amount} verified and live`, { previous: 'pending_verification', next: 'verified' });

  res.json({
    message: `Loan verified and now live for ${loan.full_name}.`,
    loan: verified, sms_sent: !!(sms && sms.ok),
  });
});

// PATCH /api/loans/:id/reject-verification — the secretary refuses the recorded
// loan, with a reason. It never becomes live. The chairperson may decide afresh.
const rejectLoanVerification = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();

  const loan = await one(
    `SELECT l.*, u.full_name, u.phone, u.language
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.id = $1`,
    [id]
  );
  if (!loan) return res.status(404).json({ message: 'That loan does not exist.' });
  if (loan.status !== 'pending_verification') {
    return res.status(400).json({ message: 'Only a recorded loan can be rejected here.' });
  }
  if (!reason) return res.status(400).json({ message: 'Say why this loan is being rejected.' });
  if (reason.length > 500) return res.status(400).json({ message: 'Keep the reason shorter.' });
  if (Number(loan.recorded_by) === Number(req.user.id)) {
    return res.status(403).json({ message: 'You cannot reject a loan you recorded yourself.' });
  }

  await query(
    `UPDATE loans SET status = 'rejected', verified_by = $2, verified_at = NOW(), rejected_reason = $3
      WHERE id = $1`,
    [id, req.user.id, reason]
  );

  await emit(EVENTS.LOAN_DECIDED, {
    decidedBy: req.user.id, loan, status: 'rejected', note: reason,
  });
  await audit(req.user.id, 'REJECT_LOAN_VERIFICATION', 'loans', id,
    `${loan.full_name}: ${loan.amount} rejected — ${reason}`,
    { previous: 'pending_verification', next: 'rejected' });

  res.json({ message: `Loan recording rejected for ${loan.full_name}.` });
});

// POST /api/loans/:id/repayments
const recordRepayment = wrap(async (req, res) => {
  const loanId = Number(req.params.id);
  const { amount, date } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Enter an amount above zero.' });
  }

  const loan = await one(
    `SELECT l.*, u.full_name, u.phone, u.language
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.id = $1`,
    [loanId]
  );
  if (!loan) return res.status(404).json({ message: 'That loan does not exist.' });
  if (loan.status !== 'verified') {
    return res.status(400).json({ message: 'Only a live (verified) loan can take repayments.' });
  }

  const paidRow = await one(
    `SELECT COALESCE(SUM(amount),0)::float AS paid,
            COALESCE(SUM(principal_part),0)::float AS principal_paid,
            COALESCE(SUM(interest_part),0)::float AS interest_paid
       FROM loan_repayments WHERE loan_id = $1`,
    [loanId]
  );

  const { interest, totalDue } = loanTotals(loan);
  const remaining = +(totalDue - paidRow.paid).toFixed(2);
  const pay = Number(amount);

  if (pay > remaining + 0.01) {
    return res.status(400).json({
      message: `That is more than is owed. The balance is ${remaining.toLocaleString()}.`,
      remaining,
    });
  }

  // Interest comes off first; what is left over is the principal. Interest is
  // banked separately because it does not go back into anyone's savings.
  const interestOwing = Math.max(0, +(interest - paidRow.interest_paid).toFixed(2));
  const interestPart = Math.min(pay, interestOwing);
  const principalPart = +(pay - interestPart).toFixed(2);

  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO loan_repayments (loan_id, amount, principal_part, interest_part, date, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, amount::float, date`,
      [loanId, pay, principalPart, interestPart, date || new Date().toISOString().slice(0, 10), req.user.id]
    );

    const newPaid = +(paidRow.paid + pay).toFixed(2);
    if (newPaid >= totalDue - 0.01) {
      await client.query(`UPDATE loans SET status = 'repaid' WHERE id = $1`, [loanId]);
    }
    return { repayment: rows[0], newPaid, cleared: newPaid >= totalDue - 0.01 };
  });

  const stillOwing = Math.max(0, +(totalDue - result.newPaid).toFixed(2));
  await emit(EVENTS.LOAN_REPAYMENT, {
    recordedBy: req.user.id, loan, repayment: result.repayment,
    principalPart, interestPart, cleared: result.cleared, stillOwing,
  });

  res.status(201).json({
    message: result.cleared ? 'Loan fully repaid.' : 'Repayment recorded.',
    repayment: result.repayment,
    total_due: totalDue, total_repaid: result.newPaid, outstanding: stillOwing,
    interest_banked: interestPart, interest_total: interest, cleared: result.cleared,
  });
});

// GET /api/loans
const listLoans = wrap(async (req, res) => {
  const { status, member_id } = req.query;
  const where = [];
  const params = [];

  // A member only ever sees her own loans.
  if (req.user.role === 'member') { params.push(req.user.member_id); where.push(`l.member_id = $${params.length}`); }
  else if (member_id) { params.push(member_id); where.push(`l.member_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`l.status = $${params.length}`); }

  const rows = await query(
    `SELECT l.*, l.applied_at AS loan_date, m.membership_number, u.full_name, u.phone,
            (m.avatar IS NOT NULL) AS has_avatar,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid,
            a.full_name AS decided_by_name
       FROM loans l
       JOIN members m ON m.id = l.member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN users a ON a.id = l.approved_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY
        CASE l.status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'pending_verification' THEN 3
          WHEN 'verified' THEN 4
          ELSE 5 END,
        l.id DESC`,
    params
  );
  res.json(rows.map(withBalance));
});

// GET /api/loans/:id
const getLoan = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const loan = await one(
    `SELECT l.*, m.membership_number, u.full_name, u.phone,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.id = $1`,
    [id]
  );
  if (!loan) return res.status(404).json({ message: 'That loan does not exist.' });
  if (req.user.role === 'member' && loan.member_id !== req.user.member_id) {
    return res.status(403).json({ message: 'You can only view your own loans.' });
  }

  const repayments = await query(
    `SELECT r.id, r.amount::float, r.principal_part::float, r.interest_part::float, r.date, u.full_name AS recorded_by_name
       FROM loan_repayments r LEFT JOIN users u ON u.id = r.recorded_by
      WHERE r.loan_id = $1 ORDER BY r.date, r.id`,
    [id]
  );
  res.json({ loan: withBalance(loan), repayments });
});

// GET /api/loans/repayments?member_id= — every repayment a member has made,
// newest first, with a running summary. The committee may look at one member
// or the whole group; a member only ever sees her own.
const listRepayments = wrap(async (req, res) => {
  const isMember = req.user.role === 'member';
  const memberId = isMember
    ? req.user.member_id
    : (req.query.member_id ? Number(req.query.member_id) : null);

  // A member account that is not tied to a member row has nothing to show.
  if (isMember && !memberId) {
    return res.json({
      member: null,
      summary: { total: 0, principal: 0, interest: 0, count: 0, first_date: null, last_date: null },
      repayments: [],
    });
  }

  const where = [];
  const params = [];
  if (memberId) { params.push(memberId); where.push(`l.member_id = $${params.length}`); }
  if (req.query.loan_id) { params.push(Number(req.query.loan_id)); where.push(`r.loan_id = $${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`r.date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`r.date <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const repayments = await query(
    `SELECT r.id, r.amount::float, r.principal_part::float, r.interest_part::float,
            to_char(r.date,'YYYY-MM-DD') AS date, r.created_at, l.id AS loan_id, l.cycle_id,
            c.cycle_name AS cycle_name,
            to_char(c.start_date,'YYYY-MM-DD') AS cycle_start,
            to_char(c.end_date,'YYYY-MM-DD') AS cycle_end,
            m.membership_number, u.full_name, (m.avatar IS NOT NULL) AS has_avatar,
            rec.full_name AS recorded_by_name
       FROM loan_repayments r
       JOIN loans l ON l.id = r.loan_id
       JOIN members m ON m.id = l.member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN cycles c ON c.id = l.cycle_id
       LEFT JOIN users rec ON rec.id = r.recorded_by
      ${whereSql}
      ORDER BY r.date DESC, r.id DESC`,
    params
  );

  const summary = await one(
    `SELECT COALESCE(SUM(r.amount),0)::float AS total,
            COALESCE(SUM(r.principal_part),0)::float AS principal,
            COALESCE(SUM(r.interest_part),0)::float AS interest,
            COUNT(*)::int AS count,
            to_char(MIN(r.date),'YYYY-MM-DD') AS first_date,
            to_char(MAX(r.date),'YYYY-MM-DD') AS last_date
       FROM loan_repayments r
       JOIN loans l ON l.id = r.loan_id
      ${whereSql}`,
    params
  );

  let member = null;
  if (memberId) {
    member = await one(
      `SELECT m.id, m.membership_number, u.full_name, (m.avatar IS NOT NULL) AS has_avatar
         FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
      [memberId]
    );
  }

  res.json({ member, summary, repayments });
});

// GET /api/loans/overdue — who has not paid before the cycle ends
const overdueLoans = wrap(async (req, res) => {
  const rows = await query(
    `SELECT l.*, u.full_name, u.phone, u.language, m.membership_number,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.status = 'verified' AND l.due_date < CURRENT_DATE
      ORDER BY l.due_date`
  );
  res.json(rows.map(withBalance));
});

// POST /api/loans/remind — text everyone whose loan is due soon or late
const sendReminders = wrap(async (req, res) => {
  const days = Number(req.body.within_days || 7);
  const rows = await query(
    `SELECT l.*, u.full_name, u.phone, u.language,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id),0)::float AS total_repaid
       FROM loans l JOIN members m ON m.id = l.member_id JOIN users u ON u.id = m.user_id
      WHERE l.status = 'verified' AND l.due_date <= CURRENT_DATE + ($1 || ' days')::interval`,
    [String(days)]
  );

  let sent = 0;
  for (const raw of rows) {
    const loan = withBalance(raw);
    if (loan.outstanding <= 0) continue;
    const result = await sendSMS(
      loan.phone,
      build('loanDueSoon', loan.language, { name: loan.full_name, outstanding: loan.outstanding, dueDate: loan.due_date }),
      { name: loan.full_name, category: 'loan_reminder', sentBy: req.user.id }
    );
    if (result.ok) sent++;
    await new Promise((r) => setTimeout(r, 350));
  }

  await audit(req.user.id, 'SEND_LOAN_REMINDERS', 'loans', null, `${sent} reminder(s)`);
  res.json({ message: `${sent} reminder(s) sent.`, sent, considered: rows.length });
});

module.exports = {
  applyLoan, decideLoan, recordLoan, verifyLoan, rejectLoanVerification,
  recordRepayment, listLoans, getLoan, listRepayments, overdueLoans, sendReminders, borrowingLimit,
};
