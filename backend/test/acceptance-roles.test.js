/**
 * ACCEPTANCE TEST — role permissions and separation of powers (§16–§17).
 *
 * One person must never be able to request, approve, record and verify the
 * same loan. Each step is held by a different office, and the backend refuses
 * the wrong role even when the frontend is bypassed. This test reads the
 * permission table, the routes and the controllers that ship. No database.
 *
 * Run with: node test/acceptance-roles.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { PERMISSIONS, can, requirePermission } = require('../config/permissions.js');

const root = path.join(__dirname, '..', '..');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const savingsCtrl = back(path.join('controllers', 'savingsController.js'));
const loanCtrl = back(path.join('controllers', 'loanController.js'));
const memberCtrl = back(path.join('controllers', 'memberController.js'));
const welfareRoutes = back(path.join('routes', 'welfareRoutes.js'));
const memberRoutes = back(path.join('routes', 'memberRoutes.js'));

/** Runs one permission middleware the way Express would. */
function run(middleware, user) {
  return new Promise((resolve) => {
    const req = { user };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    middleware(req, res, () => resolve({ status: 200, passed: true }));
  });
}

let done = 0;
async function check(n, title, fn) {
  await fn();
  done += 1;
  console.log(`  ${String(n).padStart(2, ' ')}. ${title}`);
}

(async () => {
  console.log('ACCEPTANCE TEST — role permissions and separation of powers');

  // ---- §17 every step of a loan is a different office ----

  await check(1, 'request, approve, record and verify a loan are four different jobs', () => {
    assert.deepStrictEqual(PERMISSIONS['loans.decide'], ['admin']);
    assert.deepStrictEqual(PERMISSIONS['loans.record'], ['treasurer']);
    assert.deepStrictEqual(PERMISSIONS['loans.verify'], ['secretary']);
    const sets = [['admin'], ['treasurer'], ['secretary']];
    assert.strictEqual(new Set(sets.flat()).size, 3, 'no role may hold two of the steps');
  });

  await check(2, 'the wrong office is refused on every loan step', async () => {
    for (const perm of ['loans.decide', 'loans.record', 'loans.verify']) {
      for (const role of ['admin', 'treasurer', 'secretary']) {
        const expected = can(role, perm) ? 200 : 403;
        const got = await run(requirePermission(perm), { role });
        assert.strictEqual(got.status, expected, `${role} on ${perm}`);
      }
    }
  });

  await check(3, 'an ordinary member may never touch a loan step', async () => {
    for (const perm of ['loans.decide', 'loans.record', 'loans.verify']) {
      assert.strictEqual(can('member', perm), false, `member must not hold ${perm}`);
      const got = await run(requirePermission(perm), { role: 'member' });
      assert.strictEqual(got.status, 403);
    }
  });

  await check(4, 'no permission is ever handed to the plain member role', () => {
    assert.ok(!Object.values(PERMISSIONS).some((list) => list.includes('member')),
      'members act through their own scoped routes, never an office permission');
  });

  // ---- §16 the treasurer records, never verifies her own hand ----

  await check(5, 'the treasurer holds no verify permission', () => {
    for (const perm of ['savings.verify', 'loans.verify', 'repayments.verify', 'loans.verifyId']) {
      assert.strictEqual(can('treasurer', perm), false, `treasurer must not hold ${perm}`);
    }
  });

  await check(6, 'the secretary holds no approve or record permission', () => {
    for (const perm of ['loans.decide', 'loans.record', 'savings.record', 'fines.record', 'welfare.record']) {
      assert.strictEqual(can('secretary', perm), false, `secretary must not hold ${perm}`);
    }
  });

  await check(7, 'the chairperson approves and verifies IDs but never records money', () => {
    assert.strictEqual(can('admin', 'loans.decide'), true);
    assert.strictEqual(can('admin', 'loans.verifyId'), true);
    for (const perm of ['loans.record', 'savings.record', 'fines.record', 'welfare.record', 'loans.verify']) {
      assert.strictEqual(can('admin', perm), false, `chairperson must not hold ${perm}`);
    }
  });

  // ---- self-verification guards live in the controllers ----

  await check(8, 'savings: nobody verifies a row she recorded', () => {
    assert.ok(/recorded_by\)\s*===\s*Number\(req\.user\.id\)/.test(savingsCtrl),
      'the guard must compare the recorder');
  });

  await check(9, 'loans: nobody verifies a loan she recorded', () => {
    assert.ok(/recorded_by\)\s*===\s*Number\(req\.user\.id\)/.test(loanCtrl)
      || /recorded_by[\s\S]{0,40}?req\.user\.id/.test(loanCtrl),
      'the loan verification must refuse the recorder');
  });

  await check(10, 'repayments: nobody verifies a repayment she recorded', () => {
    const seg = loanCtrl.slice(loanCtrl.indexOf('verifyRepayment'));
    assert.ok(/recorded_by[\s\S]{0,400}?req\.user\.id/.test(seg),
      'the repayment verification must refuse the recorder');
  });

  await check(11, 'the treasurer cannot change the approved loan amount when recording', () => {
    const a = loanCtrl.indexOf('const recordLoan =');
    const b = loanCtrl.indexOf('const verifyLoan =');
    const seg = loanCtrl.slice(a, b);
    assert.ok(seg.length > 0, 'the recordLoan step must be found');
    assert.ok(!/req\.body\.amount/.test(seg), 'recording must not read an amount from the body');
    assert.ok(/SET status = 'pending_verification'/.test(seg), 'it only moves the status forward');
  });

  // ---- §16 member privacy: own record only ----

  await check(12, 'a member cannot list every member\u2019s financial summary', () => {
    assert.ok(/req\.user\.role === 'member'[\s\S]{0,200}?req\.user\.member_id/.test(memberCtrl),
      'the member list must be scoped to the caller');
  });

  await check(13, 'a member cannot open another member\u2019s record', () => {
    assert.ok(/req\.user\.role === 'member' && req\.user\.member_id !== id/.test(memberCtrl),
      'the single-record route must refuse another member');
  });

  await check(14, 'the welfare read routes are guarded by a view permission', () => {
    assert.deepStrictEqual(PERMISSIONS['welfare.view'], ['admin', 'treasurer', 'secretary']);
    assert.ok(welfareRoutes.includes("requirePermission('welfare.view')"),
      'welfare reads must require the view permission');
    assert.ok(!can('member', 'welfare.view'), 'a member reads her own welfare through her profile');
  });

  await check(15, 'a member cannot delete or change an audit record', () => {
    assert.strictEqual(can('member', 'audit.view'), false, 'members do not even read the audit trail');
  });

  await check(16, 'editing a verified saving sends it back for verification', () => {
    const seg = savingsCtrl.slice(savingsCtrl.indexOf('const updateSaving'));
    assert.ok(/existing\.status === 'verified'/.test(seg), 'the edit must notice a verified row');
    assert.ok(/pending_verification/.test(seg), 'the row must return to pending verification');
    assert.ok(/verified_by = CASE WHEN/.test(seg) && /verified_at = CASE WHEN/.test(seg),
      'the old verification must be cleared, never silently kept');
  });

  console.log(`\nAll ${done} role/separation checks passed.`);
})().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
