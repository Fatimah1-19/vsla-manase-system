// Everything that should happen *besides* writing the row: text messages,
// the audit trail and the automatic absence fine. Registered once at startup.
const { on, EVENTS } = require('../utils/events');
const { sendSMS, sendBulk } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { loanTotals, activeMembersWithPhone } = require('../utils/helpers');
const { createAbsenceFine } = require('../controllers/fineController');

let registered = false;

function registerDomainListeners() {
  if (registered) return;
  registered = true;

  // ---- savings: write the trail, then text the member her receipt ----
  on(EVENTS.SAVING_RECORDED, async ({ recordedBy, member, saving, total }) => {
    await audit(recordedBy, 'RECORD_SAVING', 'savings', saving.id, `${member.full_name}: ${saving.amount}`);
    return sendSMS(
      member.phone,
      build('savingRecorded', member.language, {
        name: member.full_name, amount: saving.amount, date: saving.date, total,
      }),
      { name: member.full_name, category: 'saving', sentBy: recordedBy }
    );
  });

  // ---- loans ----
  on(EVENTS.LOAN_APPLIED, async ({ recordedBy, member, loan }) => {
    await audit(recordedBy, 'APPLY_LOAN', 'loans', loan.id,
      `${member.full_name}: ${loan.amount}, interest ${loan.with_interest ? loan.interest_rate + '%' : 'none'}`);
    return sendSMS(
      member.phone,
      build('loanApplied', member.language, { name: member.full_name, amount: loan.amount }),
      { name: member.full_name, category: 'loan', sentBy: recordedBy }
    );
  });

  on(EVENTS.LOAN_DECIDED, async ({ decidedBy, loan, status, note }) => {
    await audit(decidedBy, status === 'approved' ? 'APPROVE_LOAN' : 'REJECT_LOAN', 'loans', loan.id,
      `${loan.full_name}: ${loan.amount}${note ? ' — ' + note : ''}`);
    const { totalDue } = loanTotals(loan);
    return sendSMS(
      loan.phone,
      status === 'approved'
        ? build('loanApproved', loan.language, {
            name: loan.full_name, amount: loan.amount, totalDue, dueDate: loan.due_date })
        : build('loanRejected', loan.language, { name: loan.full_name, amount: loan.amount, note }),
      { name: loan.full_name, category: 'loan', sentBy: decidedBy }
    );
  });

  on(EVENTS.LOAN_REPAYMENT, async ({ recordedBy, loan, repayment, principalPart, interestPart, cleared, stillOwing }) => {
    await audit(recordedBy, 'RECORD_REPAYMENT', 'loan_repayments', repayment.id,
      `${loan.full_name}: ${repayment.amount} (principal ${principalPart}, interest ${interestPart})`);
    return sendSMS(
      loan.phone,
      cleared
        ? build('loanCleared', loan.language, { name: loan.full_name })
        : build('repaymentRecorded', loan.language, { name: loan.full_name, amount: repayment.amount, remaining: stillOwing }),
      { name: loan.full_name, category: 'loan', sentBy: recordedBy }
    );
  });

  // ---- fines (manual and automatic) ----
  on(EVENTS.FINE_RECORDED, async ({ recordedBy, member, fine, reason }) => {
    await audit(recordedBy || null, 'RECORD_FINE', 'fines', fine.id,
      `${member.full_name}: ${fine.amount}${reason ? ` — ${reason}` : ''}`);
    return sendSMS(
      member.phone,
      build('fineRecorded', member.language, { name: member.full_name, amount: fine.amount, reason, date: fine.date }),
      { name: member.full_name, category: 'fine', sentBy: recordedBy || null }
    );
  });

  // ---- welfare ----
  on(EVENTS.WELFARE_CONTRIBUTION, async ({ recordedBy, transaction, member }) => {
    await audit(recordedBy, 'WELFARE_CONTRIBUTION', 'welfare_fund', transaction.id, `Amount ${transaction.amount}`);
    if (!member || !member.phone) return null;
    return sendSMS(
      member.phone,
      build('welfareContribution', member.language, { name: member.full_name, amount: transaction.amount }),
      { name: member.full_name, category: 'welfare', sentBy: recordedBy }
    );
  });

  on(EVENTS.WELFARE_PAYOUT, async ({ recordedBy, transaction, member, category, notes, announceToGroup }) => {
    await audit(recordedBy, 'WELFARE_PAYOUT', 'welfare_fund', transaction.id,
      `${member.full_name}: ${transaction.amount} (${category})`);

    const personalKey = category === 'sickness' ? 'welfarePayoutSickness'
      : category === 'funeral' ? 'welfarePayoutFuneral'
      : 'welfarePayoutOther';
    await sendSMS(
      member.phone,
      build(personalKey, member.language, { name: member.full_name, amount: transaction.amount }),
      { name: member.full_name, category: 'welfare', sentBy: recordedBy }
    );

    let announced = { sent: 0, failed: 0, total: 0 };
    if (announceToGroup && (category === 'sickness' || category === 'funeral')) {
      const others = (await activeMembersWithPhone()).filter((m) => m.user_id !== member.user_id);
      const key = category === 'sickness' ? 'welfareAnnounceSickness' : 'welfareAnnounceFuneral';
      announced = await sendBulk(
        others,
        (r) => build(key, r.language, { member: member.full_name, notes: notes || '' }),
        { category: 'welfare_announcement', isBroadcast: true, sentBy: recordedBy }
      );
    }
    return announced;
  });

  // ---- meetings: tell everyone about the next one ----
  on(EVENTS.MEETING_SCHEDULED, async ({ notify, meeting_date, meeting_time, location, recordedBy }) => {
    if (!notify) return { sent: 0, failed: 0, total: 0 };
    const members = await activeMembersWithPhone();
    return sendBulk(
      members,
      (m) => build('meetingScheduled', m.language, {
        name: m.full_name, date: meeting_date, time: meeting_time, location,
      }),
      { category: 'meeting', isBroadcast: true, sentBy: recordedBy }
    );
  });

  // ---- attendance: fine the unexplained absences, once ----
  on(EVENTS.ATTENDANCE_SAVED, async ({ recordedBy, meeting, list }) => {
    if (!meeting) return;
    for (const item of list) {
      const status = ['present', 'absent', 'excused'].includes(item.status) ? item.status : 'absent';
      if (status !== 'absent') continue;
      await createAbsenceFine({
        member_id: item.member_id,
        reason: `Unexcused absence for meeting ${meeting.id}`,
        date: meeting.meeting_date,
        recorded_by: recordedBy,
        meeting_id: meeting.id,
        cycle_id: meeting.cycle_id,
      });
    }
  });
}

module.exports = { registerDomainListeners };
