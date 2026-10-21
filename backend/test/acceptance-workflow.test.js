/**
 * ACCEPTANCE TEST — the separated loan workflow.
 *
 * A loan is not one person's act. The chairperson alone settles who may
 * borrow: she checks the applicant's identification and approves the request.
 * The treasurer alone records the money leaving the box. The secretary alone
 * checks that recording, and then every repayment against it, before any of it
 * touches a balance. Nobody settles her own hand.
 *
 * Every check below reads the code that ships: the permission table, the
 * routes, the controller and the Loans page. No database is needed.
 *
 * Run with: node test/acceptance-workflow.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { PERMISSIONS, can } = require('../config/permissions.js');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const loanCtrl = back(path.join('controllers', 'loanController.js'));
const loanRoutes = back(path.join('routes', 'loanRoutes.js'));
const schema = back(path.join('db', 'schema.sql'));
const loansPage = read(path.join('frontend', 'src', 'pages', 'Loans.jsx'));

let done = 0;
async function check(n, title, fn) {
  await fn();
  done += 1;
  console.log(`  ${String(n).padStart(2, ' ')}. ${title}`);
}

(async () => {
  console.log('ACCEPTANCE TEST — separated loan workflow');

  // ---- §5 the ID is settled by the chairperson alone ----

  await check(1, 'only the chairperson holds loans.verifyId', () => {
    assert.deepStrictEqual(PERMISSIONS['loans.verifyId'], ['admin']);
  });

  await check(2, 'neither the treasurer nor the secretary may verify an ID', () => {
    assert.strictEqual(can('treasurer', 'loans.verifyId'), false);
    assert.strictEqual(can('secretary', 'loans.verifyId'), false);
    assert.strictEqual(can('member', 'loans.verifyId'), false);
  });

  await check(3, 'the chairperson holds it', () => {
    assert.strictEqual(can('admin', 'loans.verifyId'), true);
  });

  await check(4, 'the ID is verified and rejected through their own routes', () => {
    assert.ok(/\$\{base\}\/:id\/verify-id|'\/:id\/verify-id'/.test(loanRoutes.replace(/\s+/g, ' '))
      || loanRoutes.includes("'/:id/verify-id'"), 'verify-id route must exist');
    assert.ok(loanRoutes.includes("'/:id/reject-id'"), 'reject-id route must exist');
    assert.ok(loanRoutes.includes('verifyLoanId'), 'verifyLoanId must be wired');
    assert.ok(loanRoutes.includes('rejectLoanId'), 'rejectLoanId must be wired');
  });

  await check(5, 'a rejected ID must carry a reason', () => {
    assert.ok(/rejectLoanId[\s\S]{0,1200}?reason/.test(loanCtrl), 'rejectLoanId reads reason');
    assert.ok(/reason[\s\S]{0,400}?(400|500)|length[\s\S]{0,80}?reason/i.test(loanCtrl),
      'a reason is required and bounded');
  });

  await check(6, 'ID status lives on the loan, with who settled it and when', () => {
    assert.ok(/id_status/.test(schema), 'loans.id_status column');
    assert.ok(/id_verified_by/.test(schema), 'loans.id_verified_by column');
    assert.ok(/id_verified_at/.test(schema), 'loans.id_verified_at column');
    assert.ok(/id_rejected_reason/.test(schema), 'loans.id_rejected_reason column');
  });

  await check(7, 'the chairperson alone approves a loan', () => {
    assert.deepStrictEqual(PERMISSIONS['loans.decide'], ['admin']);
  });

  await check(8, 'approval is refused until the ID is verified', () => {
    assert.ok(/decideLoan[\s\S]{0,1500}?id_status\s*!==\s*'verified'/.test(loanCtrl),
      'decideLoan must hard-block approval on an unverified ID');
  });

  // ---- §6 eligibility: the rules are only read back, never invented ----

  await check(9, 'the eligibility route states ELIGIBLE or NOT ELIGIBLE', () => {
    assert.ok(loanRoutes.includes("'/eligibility/:memberId'"), 'eligibility route must exist');
    assert.ok(loanCtrl.includes('ELIGIBLE'), 'it states ELIGIBLE');
    assert.ok(loanCtrl.includes('NOT_ELIGIBLE'), 'it states NOT_ELIGIBLE');
  });

  await check(10, 'eligibility carries the ID among its checks', () => {
    assert.ok(/checks[\s\S]{0,600}?id_verified/.test(loanCtrl)
      || /id_verified[\s\S]{0,600}?checks/.test(loanCtrl), 'ID must be one of the checks');
  });

  await check(11, 'the existing eligibility checks are still there', () => {
    assert.ok(loanCtrl.includes('active_membership'), 'membership check kept');
    assert.ok(loanCtrl.includes("'has_savings'") || loanCtrl.includes('has_savings'), 'savings check kept');
    assert.ok(loanCtrl.includes("'no_open_loan'") || loanCtrl.includes('no_open_loan'), 'open-loan check kept');
  });

  // ---- §7-§9 the money records are separated ----

  await check(12, 'only the treasurer records the loan', () => {
    assert.deepStrictEqual(PERMISSIONS['loans.record'], ['treasurer']);
    assert.strictEqual(can('admin', 'loans.record'), false);
    assert.strictEqual(can('secretary', 'loans.record'), false);
  });

  await check(13, 'only the secretary verifies the loan', () => {
    assert.deepStrictEqual(PERMISSIONS['loans.verify'], ['secretary']);
    assert.strictEqual(can('admin', 'loans.verify'), false);
    assert.strictEqual(can('treasurer', 'loans.verify'), false);
  });

  await check(14, 'nobody verifies a loan she recorded herself', () => {
    assert.ok(/verifyLoan[\s\S]{0,1200}?(recorded_by|recordedBy)[\s\S]{0,200}?req\.user\.id/.test(loanCtrl)
      || /Number\((?:loan\.)?recorded_by\)\s*===\s*Number\(req\.user\.id\)/.test(loanCtrl),
      'self-verification must be refused');
  });

  // ---- §10 repayment verification ----

  await check(15, 'only the secretary verifies repayments', () => {
    assert.deepStrictEqual(PERMISSIONS['repayments.verify'], ['secretary']);
    assert.strictEqual(can('treasurer', 'repayments.verify'), false);
    assert.strictEqual(can('admin', 'repayments.verify'), false);
  });

  await check(16, 'a recorded repayment starts pending, not live', () => {
    assert.ok(/status/.test(schema) && /pending_verification/.test(schema),
      'loan_repayments.status must default to pending_verification');
    assert.ok(/recordRepayment[\s\S]{0,2500}?pending_verification/.test(loanCtrl),
      'recordRepayment inserts a pending repayment');
  });

  await check(17, 'only verified repayments reduce what is owed', () => {
    assert.ok(/status = 'verified'/.test(loanCtrl), 'balances count verified repayments only');
  });

  await check(18, 'the treasurer cannot verify her own repayment', () => {
    assert.ok(/verifyRepayment[\s\S]{0,1500}?recorded_by[\s\S]{0,200}?req\.user\.id/.test(loanCtrl)
      || /verifyRepayment[\s\S]{0,1500}?req\.user\.id[\s\S]{0,200}?recorded_by/.test(loanCtrl),
      'self-verification must be refused');
  });

  await check(19, 'repayment verify and reject have their own routes', () => {
    assert.ok(loanRoutes.includes("'/:id/repayments/:rid/verify'"), 'repayment verify route');
    assert.ok(loanRoutes.includes("'/:id/repayments/:rid/reject'"), 'repayment reject route');
    assert.ok(loanRoutes.includes('verifyRepayment') && loanRoutes.includes('rejectRepayment'),
      'both handlers wired');
  });

  await check(20, 'the secretary has a queue of repayments awaiting her', () => {
    assert.ok(loanRoutes.includes("'/repayments/pending'"), 'pending repayments route');
    assert.ok(/pendingRepayments/.test(loanCtrl), 'pendingRepayments handler');
  });

  await check(21, 'a rejected repayment must carry a reason', () => {
    assert.ok(/rejectRepayment[\s\S]{0,1200}?reason/.test(loanCtrl), 'rejectRepayment reads reason');
    assert.ok(/rejected_reason/.test(schema), 'loan_repayments.rejected_reason column');
  });

  // ---- the page shows each office its own desk ----

  await check(22, 'the Loans page shows the chairperson her approvals queue', () => {
    assert.ok(loansPage.includes('queueApprovals'), 'approvals queue');
    assert.ok(/canDecide\s*&&[\s\S]{0,200}?queueApprovals/.test(loansPage),
      'the approvals card is the chairperson\u2019s alone');
  });

  await check(23, 'the page shows the treasurer loans awaiting recording', () => {
    assert.ok(loansPage.includes('queueAwaitingRecording'), 'recording queue');
    assert.ok(/canRecordMoney\s*&&[\s\S]{0,200}?queueAwaitingRecording/.test(loansPage),
      'the recording card is the treasurer\u2019s alone');
  });

  await check(24, 'the page shows the secretary verification and repayment queues', () => {
    assert.ok(loansPage.includes('queueVerification'), 'loans-to-verify queue');
    assert.ok(loansPage.includes('queueRepayments'), 'repayments-to-verify queue');
    assert.ok(/canVerify\s*&&[\s\S]{0,300}?queueVerification/.test(loansPage),
      'the verification cards are the secretary\u2019s alone');
  });

  await check(25, 'the page carries the ID verify and reject actions', () => {
    assert.ok(loansPage.includes('verifyId') && loansPage.includes('rejectId'),
      'the ID actions must be on the page');
    assert.ok(loansPage.includes('/verify-id') && loansPage.includes('/reject-id'),
      'the page calls the ID routes');
  });

  await check(26, 'the page shows the applicant\u2019s eligibility before approval', () => {
    assert.ok(loansPage.includes('/loans/eligibility/'), 'the page reads eligibility');
    assert.ok(loansPage.includes('notEligible') || loansPage.includes('eligible'), 'it states the verdict');
  });

  await check(27, 'the page offers repayment verification to the secretary', () => {
    assert.ok(loansPage.includes('/repayments/') && /\/verify`/.test(loansPage), 'verify call present');
    assert.ok(loansPage.includes('pendingRepaymentsTitle') || loansPage.includes('queueRepayments'),
      'the pending-repayments view exists');
  });

  await check(28, 'the ID document is served privately, never as a public link', () => {
    assert.ok(loanRoutes.includes("'/:id/id-document'"), 'id-document route exists');
    assert.ok(/no-store/i.test(read(path.join('frontend', 'src', 'api', 'client.js')))
      || /no-store/i.test(loanCtrl), 'the document is not cached');
  });

  console.log(`\nAll ${done} workflow checks passed.`);
})().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
