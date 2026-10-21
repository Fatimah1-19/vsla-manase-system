/**
 * ACCEPTANCE TEST — fines, welfare and the audit trail.
 *
 * Not every money action is a three-handed act. A fine and a welfare
 * contribution are the treasurer's record alone: they count the moment she
 * writes them, with no waiting for the secretary. Only savings, loans and loan
 * repayments pass through verification. And every important financial act is
 * written to the audit trail, which nobody may edit or erase.
 *
 * Every check below reads the code that ships. No database is needed.
 *
 * Run with: node test/acceptance-fines-welfare.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { PERMISSIONS } = require('../config/permissions.js');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const fineCtrl = back(path.join('controllers', 'fineController.js'));
const welfareCtrl = back(path.join('controllers', 'welfareController.js'));
const profileCtrl = back(path.join('controllers', 'profileController.js'));
const loanCtrl = back(path.join('controllers', 'loanController.js'));
const savingsCtrl = back(path.join('controllers', 'savingsController.js'));
const fineRoutes = back(path.join('routes', 'fineRoutes.js'));
const welfareRoutes = back(path.join('routes', 'welfareRoutes.js'));
const auditRoutes = back(path.join('routes', 'auditRoutes.js'));
const auditCtrl = back(path.join('controllers', 'auditController.js'));
const listeners = back(path.join('events', 'listeners.js'));
const schema = back(path.join('db', 'schema.sql'));
const finesPage = read(path.join('frontend', 'src', 'pages', 'Fines.jsx'));
const welfarePage = read(path.join('frontend', 'src', 'pages', 'Welfare.jsx'));

let done = 0;
async function check(n, title, fn) {
  await fn();
  done += 1;
  console.log(`  ${String(n).padStart(2, ' ')}. ${title}`);
}

(async () => {
  console.log('ACCEPTANCE TEST — fines, welfare and the audit trail');

  // ---- §11 fines: recorded once, no verification stage ----

  await check(1, 'a fine is final the moment the treasurer records it', () => {
    assert.ok(/INSERT INTO fines/.test(fineCtrl), 'the fine is inserted outright');
    assert.ok(!/verified|pending_verification/.test(fineCtrl),
      'a fine never carries a verification status');
  });

  await check(2, 'there is no fines verification permission', () => {
    assert.strictEqual(PERMISSIONS['fines.verify'], undefined);
    assert.ok(!Object.keys(PERMISSIONS).some((k) => /^fines\.(verify|reject)/.test(k)),
      'no fine verify/reject permission exists');
  });

  await check(3, 'there is no fine verify or reject route', () => {
    assert.ok(!/verify/i.test(fineRoutes) && !/reject/i.test(fineRoutes),
      'no verification route on fines');
  });

  await check(4, 'a fine updates the member\u2019s account immediately', () => {
    assert.ok(/FROM fines WHERE member_id = \$1 AND paid = FALSE/.test(
      back(path.join('controllers', 'dashboardController.js'))),
      'the member\u2019s unpaid fine total reads every recorded fine at once');
    assert.ok(!/FROM fines[\s\S]{0,200}?status\s*=\s*'verified'/.test(
      back(path.join('controllers', 'dashboardController.js'))),
      'an unpaid fine is never held behind verification');
  });

  await check(5, 'the fines page offers no pending-verification state', () => {
    assert.ok(!/pending_verification/.test(finesPage), 'no pending badge on fines');
    assert.ok(!/verify/i.test(finesPage), 'no verify action on fines');
  });

  // ---- §12 welfare: recorded once, no verification stage ----

  await check(6, 'a welfare contribution is final the moment it is recorded', () => {
    assert.ok(/INSERT INTO welfare_fund/.test(welfareCtrl), 'the contribution is inserted outright');
    assert.ok(!/verified|pending_verification/.test(welfareCtrl),
      'welfare never carries a verification status');
  });

  await check(7, 'there is no welfare verification permission', () => {
    assert.strictEqual(PERMISSIONS['welfare.verify'], undefined);
    assert.ok(!Object.keys(PERMISSIONS).some((k) => /^welfare\.(verify|reject)/.test(k)),
      'no welfare verify/reject permission exists');
  });

  await check(8, 'there is no welfare verify or reject route', () => {
    assert.ok(!/verify/i.test(welfareRoutes) && !/reject/i.test(welfareRoutes),
      'no verification route on welfare');
  });

  await check(9, 'a contribution updates the member and the fund immediately', () => {
    assert.ok(!/status\s*=\s*'verified'/.test(welfareCtrl),
      'the welfare fund balance never waits on verification');
    assert.ok(/BALANCE_SQL|balance/.test(welfareCtrl), 'the fund balance is read from every row');
  });

  await check(10, 'the welfare page offers no pending-verification state', () => {
    assert.ok(!/pending_verification/.test(welfarePage), 'no pending badge on welfare');
    assert.ok(!/verify/i.test(welfarePage), 'no verify action on welfare');
  });

  // ---- §13 statuses ----

  await check(11, 'savings keep Pending verification / Verified / Rejected', () => {
    assert.ok(/pending_verification/.test(savingsCtrl) && /'verified'/.test(savingsCtrl)
      && /'rejected'/.test(savingsCtrl), 'the three savings states are all present');
  });

  await check(12, 'loans keep the full separated flow of statuses', () => {
    for (const s of ["'pending'", "'approved'", 'pending_verification', "'verified'", "'rejected'"]) {
      assert.ok(loanCtrl.includes(s), `the loan status ${s} is in use`);
    }
  });

  await check(13, 'loan repayments keep Pending verification / Verified / Rejected', () => {
    assert.ok(/pending_verification/.test(loanCtrl) && /'verified'/.test(loanCtrl)
      && /'rejected'/.test(loanCtrl), 'the three repayment states are all present');
  });

  await check(14, 'fines stand as recorded, paid or outstanding — never verified', () => {
    assert.ok(/paid/.test(schema) && /fines/.test(schema), 'the fine keeps its paid flag');
    assert.ok(!/fines[\s\S]{0,400}?verified/.test(schema), 'no verified column on fines');
  });

  // ---- §14 member accounts reflect the right transactions ----

  await check(15, 'the member\u2019s own savings total counts verified savings only', () => {
    assert.ok(/FROM savings WHERE member_id = \$1 AND status = 'verified'/.test(profileCtrl),
      'the profile savings total must filter verified');
  });

  await check(16, 'the member\u2019s live-loan and outstanding figures follow the verified stage', () => {
    assert.ok(/l\.status === 'verified'/.test(profileCtrl),
      'a live loan is the verified stage, not the approved stage');
    assert.ok(!/l\.status === 'approved'/.test(profileCtrl),
      'no figure may still key off the stale approved status');
  });

  await check(17, 'verified savings and repayments drive the balances', () => {
    assert.ok(/status = 'verified'/.test(profileCtrl), 'repayment sums filter verified');
    assert.ok(/r\.status = 'verified'/.test(profileCtrl), 'repayments filter on verified');
  });

  await check(18, 'verification never creates a second row', () => {
    assert.ok(/UPDATE savings SET status = 'verified'/.test(savingsCtrl),
      'savings verification updates in place');
    assert.ok(/UPDATE loan_repayments SET status = 'verified'/.test(loanCtrl),
      'repayment verification updates in place');
  });

  // ---- §15 audit trail ----

  const AUDIT_ACTS = [
    ['savings recorded', /RECORD_SAVING/],
    ['savings verified', /VERIFY_SAVING/],
    ['loan approved', /APPROVE_LOAN/],
    ['ID verified', /VERIFY_ID/],
    ['loan recorded', /RECORD_LOAN/],
    ['loan verified', /VERIFY_LOAN/],
    ['fine recorded', /RECORD_FINE/],
    ['welfare recorded', /WELFARE_CONTRIBUTION|WELFARE_PAYOUT/],
  ];
  const allAuditText = listeners + savingsCtrl + loanCtrl + fineCtrl + welfareCtrl;
  for (let i = 0; i < AUDIT_ACTS.length; i += 1) {
    const [title, re] = AUDIT_ACTS[i];
    await check(19 + i, `the audit trail records: ${title}`, () => {
      assert.ok(re.test(allAuditText), `${title} must be logged to the audit trail`);
    });
  }

  await check(27, 'the audit trail is read-only at the routes', () => {
    assert.ok(!/router\.(post|patch|put|delete)/i.test(auditRoutes),
      'no write route may exist on the audit trail');
  });

  await check(28, 'the audit controller exposes no writer', () => {
    const exported = auditCtrl.split('module.exports')[1] || '';
    assert.ok(!/update|delete|remove/i.test(exported),
      'no update or delete of audit records may be exported');
  });

  await check(29, 'the database itself refuses to change an audit record', () => {
    assert.ok(/prevent_audit_change/.test(schema), 'an append-only guard exists');
    assert.ok(/BEFORE UPDATE OR DELETE ON audit_logs/.test(schema),
      'the guard blocks both update and delete');
  });

  console.log(`\nAll ${done} fines/welfare/audit checks passed.`);
})().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
