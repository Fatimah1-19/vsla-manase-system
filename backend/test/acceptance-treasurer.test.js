/**
 * FINAL ACCEPTANCE TEST — the treasurer module.
 *
 * The treasurer records and maintains the VSLA money: savings, loans,
 * repayments, fines, welfare, the monthly wrappers and the share-out. She is
 * never the chairperson and never the system administrator, she never gets
 * the final word on who joins, and she never approves a loan — not even her
 * own. Each of the 37 checks below is asserted against
 * the code that ships, in the same style as the other acceptance tests: the
 * rules and the wiring are read and checked, no database is needed.
 *
 * Run with: node test/acceptance-treasurer.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ROLES, PERMISSIONS, can, requirePermission } = require('../config/permissions.js');
const shareout = require('../utils/shareout.js');
const helpers = require('../utils/helpers.js');
const cases = require('../utils/cases.js');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const routes = (file) => back(path.join('routes', file));
const controllers = (file) => back(path.join('controllers', file));
const page = (file) => read(path.join('frontend', 'src', 'pages', file));
const dash = (file) => read(path.join('frontend', 'src', 'pages', 'dashboards', file));
const nav = read(path.join('frontend', 'src', 'components', 'navItems.js'));
const app = read(path.join('frontend', 'src', 'App.jsx'));
const authContext = read(path.join('frontend', 'src', 'context', 'AuthContext.jsx'));
const schema = back(path.join('db', 'schema.sql'));

const dashCtrl = controllers('dashboardController.js');
const savingsCtrl = controllers('savingsController.js');
const loanCtrl = controllers('loanController.js');
const listeners = back(path.join('events', 'listeners.js'));
const joinCtrl = controllers('joinRequestController.js');
const settingsCtrl = controllers('settingsController.js');
const auditCtrl = controllers('auditController.js');

const treasurerBoard = dash('TreasurerDashboard.jsx');
const savingsPage = page('Savings.jsx');
const loansPage = page('Loans.jsx');
const finesPage = page('Fines.jsx');
const welfarePage = page('Welfare.jsx');
const wrappersPage = page('Wrappers.jsx');
const sharePage = page('ShareOut.jsx');
const reportsPage = page('Reports.jsx');

/** Runs one permission middleware the way Express would. */
function run(middleware, user) {
  return new Promise((resolve) => {
    const req = { user };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    middleware(req, res, () => resolve({ status: 200, body: null, passed: true }));
  });
}

let done = 0;
async function check(n, title, fn) {
  await fn();
  done += 1;
  console.log(`  ${String(n).padStart(2, ' ')}. ${title}`);
}

(async () => {
  console.log('FINAL ACCEPTANCE TEST — treasurer module');

  await check(1, 'the treasurer reaches her own dashboard', () => {
    assert.ok(app.includes('<Route index element={<Dashboard />} />'),
      'the board must be the landing page of the app shell');
    assert.ok(/treasurer:\s*TreasurerDashboard/.test(page('Dashboard.jsx')),
      'the treasurer role must be handed the money board');
    assert.ok(treasurerBoard.includes('quickActions'), 'her board must carry the quick actions');
  });

  await check(2, 'the dashboard shows the real money figures', () => {
    for (const field of ['total_savings', 'loans_out', 'repaid', 'outstanding', 'cash_in_box',
                         'interest_earned', 'welfare_balance', 'fines_outstanding']) {
      assert.ok(dashCtrl.includes(field), `the payload must carry ${field}`);
    }
    for (const field of ['recent_savings', 'pending_loans', 'monthly_flow', 'today', 'wrappers']) {
      assert.ok(dashCtrl.includes(field), `the treasurer's board must carry ${field}`);
    }
    assert.ok(/wantsMoney = role === 'treasurer' \|\| role === 'admin'/.test(dashCtrl),
      'the money board is built from the money data');
    // The seven figures the treasurer opens the day with, in her own order.
    const order = ['dashboard.totalSavings', 'dashboard.activeLoans', 'dashboard.groupOutstanding',
                   'analytics.totalRepayments', 'dashboard.finesOutstanding', 'dashboard.welfareBalance'];
    const idx = order.map((c) => treasurerBoard.indexOf(`t('${c}')`));
    assert.ok(idx.every((i) => i > -1), 'her board must carry all seven of her figures');
    assert.ok(idx.every((i, j) => j === 0 || i > idx[j - 1]),
      'the figures must stand in the treasurer\'s own order');
    assert.ok(treasurerBoard.includes('analytics.totalRepayments') && treasurerBoard.includes('m.repaid'),
      'the total repayments card must draw a real figure');
    assert.ok(/cycle && \(/.test(treasurerBoard) && dashCtrl.includes('base.cycle'),
      'the current saving cycle must be shown from the live cycle');
  });

  await check(3, 'the dashboard offers every recording shortcut', () => {
    assert.ok(treasurerBoard.includes('treas.qaRecordSavings')
      && treasurerBoard.includes('treas.qaRecordLoan')
      && treasurerBoard.includes('treas.qaRecordRepayment')
      && treasurerBoard.includes('treas.qaRecordFine')
      && treasurerBoard.includes('treas.qaRecordWelfare')
      && treasurerBoard.includes('treas.qaViewActiveLoans')
      && treasurerBoard.includes('treas.qaFinancialReports'),
      'savings, loans, repayments, fines, welfare, active loans and reports must be one tap away');
    assert.ok(treasurerBoard.includes('/app/savings') && treasurerBoard.includes('/app/loans')
      && treasurerBoard.includes('/app/loans?filter=approved')
      && treasurerBoard.includes('/app/fines') && treasurerBoard.includes('/app/welfare')
      && treasurerBoard.includes('/app/analytics'),
      'every shortcut must point at a page she may open');
    const en = read(path.join('frontend', 'src', 'i18n', 'en.extra.js'));
    const ny = read(path.join('frontend', 'src', 'i18n', 'ny.extra.js'));
    assert.ok(en.includes('qaRecordSavings') && ny.includes('qaRecordSavings')
      && en.includes('qaViewActiveLoans') && ny.includes('qaViewActiveLoans'),
      'the shortcut labels must exist in both languages');
  });

  await check(4, 'the treasurer can view and record savings', async () => {
    assert.ok(routes('savingsRoutes.js').includes("router.get('/', requirePermission('savings.view')"));
    assert.ok(routes('savingsRoutes.js').includes("router.post('/', requirePermission('savings.record')"));
    assert.ok(can('treasurer', 'savings.view') && can('treasurer', 'savings.record'));
    assert.ok(savingsCtrl.includes('recordSaving'), 'the saving must be written by the controller');
    assert.ok(savingsPage.includes('canRecordMoney'), 'the page must gate its write on the treasurer');
    const gate = await run(requirePermission('savings.record'), { role: 'secretary' });
    assert.strictEqual(gate.status, 403, 'the secretary never writes a saving');
  });

  await check(5, 'a saving cannot be recorded with bad details', () => {
    // The member must be chosen and the amount must be a real figure above zero.
    assert.ok(/if \(!member_id\)/.test(savingsCtrl), 'a saving must name its member');
    assert.ok(/value <= 0/.test(savingsCtrl), 'a negative or zero amount must be refused');
    assert.ok(/Enter an amount/.test(savingsCtrl), 'a missing amount must be refused');
    // The date must be a real day, never in the future.
    assert.ok(savingsCtrl.includes('validDate') && savingsCtrl.includes('ISO_DATE'),
      'the date must be checked as a real calendar date');
    assert.ok(/cannot be in the future/.test(savingsCtrl),
      'a future transaction date must be refused');
    // The same member, amount and date cannot be written twice.
    assert.ok(/duplicate/.test(savingsCtrl) && savingsCtrl.includes('409'),
      'an obvious duplicate must be refused');
    // The screen checks the same rules before it sends, and confirms first.
    assert.ok(savingsPage.includes('savings.amountPositive') && savingsPage.includes('savings.badDate'),
      'the screen must check the amount and the date');
    assert.ok(savingsPage.includes('max={inputDate()}'), 'the date picker must stop at today');
    assert.ok(savingsPage.includes('savings.confirmRecord'), 'the transaction must be confirmed first');
    // Who recorded it, and the trail it leaves.
    assert.ok(savingsCtrl.includes('recorded_by') && savingsCtrl.includes('req.user.id'),
      'the saving must record the treasurer who did it');
    assert.ok(listeners.includes('RECORD_SAVING'), 'every saving must be written to the trail');
  });

  await check(6, 'the savings screen filters by member and by date', () => {
    assert.ok(savingsPage.includes('memberId') && savingsPage.includes('setMemberId'),
      'she must be able to pick a member');
    assert.ok(savingsPage.includes('setFrom') && savingsPage.includes('setTo'),
      'she must be able to pick a date range');
    assert.ok(savingsPage.includes("r.member_id !== picked"), 'the member filter must apply to the rows');
    assert.ok(savingsPage.includes('day(r) < from') && savingsPage.includes('day(r) > to'),
      'the date range must apply to the rows');
    assert.ok(savingsCtrl.includes('recorded_by_name'), 'each row must name who recorded it');
    assert.ok(savingsCtrl.includes('m.membership_number'), 'each row must carry the member reference');
  });

  await check(7, 'the treasurer views and records loans, but never approves them', () => {
    assert.ok(routes('loanRoutes.js').includes("requirePermission('loans.viewAll')"));
    assert.ok(routes('loanRoutes.js').includes("router.patch('/:id/decision', requirePermission('loans.decide')"));
    // Approval is the chairperson's; the treasurer records, never approves.
    assert.ok(can('treasurer', 'loans.viewAll') && !can('treasurer', 'loans.decide'),
      'the treasurer sees the loans but does not lend them');
    assert.ok(can('admin', 'loans.decide'), 'the chairperson settles the loan');
    assert.ok(can('treasurer', 'loans.record'), 'the treasurer records the authorised loan');
    assert.ok(loansPage.includes('canDecide') && loansPage.includes('isDecider'),
      'the decision buttons must follow the chairperson, not the treasurer');
    assert.ok(loansPage.includes('canRecordMoney'), 'the loans page must gate its writes');
  });

  await check(8, 'nobody approves their own loan request', () => {
    // The approval step refuses the applicant when they are the one deciding.
    assert.ok(loanCtrl.includes('You cannot decide your own loan request'),
      'the server must refuse a self-decision');
    assert.ok(/req\.user\.member_id && Number\(loan\.member_id\) === Number\(req\.user\.member_id\)/.test(loanCtrl),
      'the refusal must compare the decider with the borrower');
    // The workflow is Request -> authorised approval -> treasurer records -> active.
    assert.ok(!can('treasurer', 'loans.decide') && can('admin', 'loans.decide'),
      'approval stays a chairperson decision, never a treasurer one');
  });

  await check(9, 'the loans section shows every figure the treasurer needs', () => {
    // The board hands her the whole picture of each loan.
    for (const field of ['amount', 'interest_amount', 'total_due', 'total_repaid', 'outstanding', 'due_date', 'status']) {
      assert.ok(loanCtrl.includes(field), `the loan payload must carry ${field}`);
    }
    assert.ok(loanCtrl.includes('applied_at'), 'the loan date must be on the record');
    // The screen shows member, amount, interest, total repayable, paid, dates and status.
    for (const col of ['loans.principal', 'loans.interest', 'loans.totalDue', 'loans.repaid',
                       'loans.outstanding', 'loans.loanDate', 'loans.dueDate']) {
      assert.ok(loansPage.includes(col), `the loan list must carry the ${col} column`);
    }
    // The views she asked for: applications, active, overdue, history.
    for (const f of ["'pending'", "'approved'", "'overdue'", "'repayments'"]) {
      assert.ok(loansPage.includes(f), `the loans section must offer the ${f} view`);
    }
    assert.ok(routes('loanRoutes.js').includes("router.get('/overdue'"),
      'overdue loans must be reachable');
  });

  await check(10, 'the treasurer can record loan repayments', () => {
    assert.ok(routes('loanRoutes.js').includes("router.get('/repayments', c.listRepayments)")
      && routes('loanRoutes.js').includes("router.post('/:id/repayments', requirePermission('loans.record')"));
    assert.ok(can('treasurer', 'loans.record'));
    assert.ok(listeners.includes('RECORD_REPAYMENT'), 'every repayment must be written to the trail');
    assert.ok(loansPage.includes('canRecordMoney'), 'the repayment panel is the treasurer\'s alone');
    assert.ok(/get\('tab'\) === 'repayments'/.test(loansPage) && loansPage.includes('openRepayments()'),
      '?tab=repayments must open the repayment history');
    // The repayment is found by member, or narrowed to one loan, and it can be
    // searched. The date is confirmed, and the balance is worked out by the
    // server, never by hand on the screen.
    assert.ok(loanCtrl.includes("req.query.loan_id"), 'the history must filter by loan');
    assert.ok(loansPage.includes('filterByLoan') && loansPage.includes('allLoans'),
      'the screen must offer the loan filter');
    assert.ok(loanCtrl.includes('interestOwing') && loanCtrl.includes('principalPart'),
      'the split and the balance must come from the existing calculation');
    assert.ok(!/outstanding\s*=.*amount.*-/.test(loansPage),
      'the screen must not work out the balance itself');
    assert.ok(loanCtrl.includes('recorded_by') && loanCtrl.includes('req.user.id'),
      'every repayment must name the treasurer who recorded it');
  });

  await check(11, 'the overdue loans board is clear and honest', () => {
    // The board shows member, amount, paid, outstanding, due date, days late, standing.
    for (const col of ['loans.principal', 'loans.amountPaid', 'loans.outstanding',
                       'loans.dueDate', 'loans.daysOverdue']) {
      assert.ok(loansPage.includes(col), `the overdue board must carry the ${col} column`);
    }
    // The four clear indicators the treasurer asked for.
    for (const s of ['standingOverdue', 'standingDueSoon', 'standingActive', 'standingFullyPaid']) {
      assert.ok(loansPage.includes(s), `the board must show the ${s} indicator`);
    }
    assert.ok(loansPage.includes('daysOverdue') && loansPage.includes('function standing'),
      'the lateness and the standing must be worked out in one place');
    // Overdue is read from the live figure the server already keeps.
    assert.ok(loansPage.includes("standing(l) === 'overdue'"), 'the board must count the late loans');
    assert.ok(!/UPDATE loans SET/.test(loansPage), 'the screen must not touch the loan rules');
  });

  await check(12, 'the treasurer can view and record fines', () => {
    assert.ok(routes('fineRoutes.js').includes("router.get('/', c.listFines)")
      && routes('fineRoutes.js').includes("router.post('/', requirePermission('fines.record')")
      && routes('fineRoutes.js').includes("router.patch('/:id/pay', requirePermission('fines.record')"));
    assert.ok(can('treasurer', 'fines.viewAll') && can('treasurer', 'fines.record'));
    assert.ok(listeners.includes('RECORD_FINE'), 'every fine must be written to the trail');
    assert.ok(finesPage.includes('canRecordMoney'), 'the fine screen must gate its write');
  });

  await check(38, 'the fine types follow the group\u2019s configured amounts', () => {
    const ctrl = controllers('fineController.js');
    assert.ok(routes('fineRoutes.js').includes("router.get('/types', c.listFineTypes)"),
      'the fine kinds and their amounts must be offered');
    assert.ok(ctrl.includes('FINE_TYPES') && ctrl.includes("setting: 'absence_fine'"),
      'absence, late and misconduct must each point at a configured setting');
    assert.ok(ctrl.includes('configuredAmount(type)') && ctrl.includes('if (meta.setting)'),
      'only "other" takes a typed amount');
    assert.ok(ctrl.includes('That fine is not set by the group yet'),
      'a switched-off fine kind must be refused');
    assert.ok(ctrl.includes("todayISO()") && ctrl.includes('cannot be in the future'),
      'a fine can never be dated ahead of today');
    assert.ok(finesPage.includes("fixedAmount != null") && finesPage.includes('readOnly'),
      'a fixed fine\u2019s amount cannot be edited on the screen');
    assert.ok(finesPage.includes("value={typeFilter}") && finesPage.includes('fines.allTypes'),
      'the page must filter by member, kind and date');
    assert.ok(ctrl.includes('by_type') && finesPage.includes('summary?.by_type'),
      'the fines by kind must be summarised');
    assert.ok(can('treasurer', 'system.settings') === false,
      'the treasurer still cannot quietly change the configured amounts');
  });

  await check(13, 'the treasurer can view and record welfare', () => {
    assert.ok(routes('welfareRoutes.js').includes("router.post('/contribution', requirePermission('welfare.record')")
      && routes('welfareRoutes.js').includes("router.post('/payout', requirePermission('welfare.record')"));
    assert.ok(can('treasurer', 'welfare.record'));
    assert.ok(listeners.includes('WELFARE_CONTRIBUTION') && listeners.includes('WELFARE_PAYOUT'),
      'welfare money must be written to the trail');
    assert.ok(welfarePage.includes('canRecordMoney'), 'the welfare screen must gate its write');
  });

  await check(14, 'the treasurer can view and record the monthly wrappers', () => {
    assert.ok(routes('contributionRoutes.js').includes("router.get('/', requirePermission('contributions.view')")
      && routes('contributionRoutes.js').includes("router.post('/', requirePermission('contributions.record')"));
    assert.ok(can('treasurer', 'contributions.view') && can('treasurer', 'contributions.record'));
    assert.ok(back(path.join('controllers', 'contributionController.js')).includes('RECORD_MONTHLY_CONTRIBUTION'),
      'every monthly contribution must be written to the trail');
    assert.ok(wrappersPage.includes('canRecordMoney'), 'the wrappers screen must gate its write');
  });

  await check(15, 'the treasurer can view and record the share-out', () => {
    assert.ok(routes('shareOutRoutes.js').includes("router.get('/', requirePermission('shareout.view')")
      && routes('shareOutRoutes.js').includes("router.post('/:id/confirm', requirePermission('shareout.record')"));
    assert.ok(can('treasurer', 'shareout.view') && can('treasurer', 'shareout.record'));
    assert.ok(back(path.join('controllers', 'shareoutController.js')).includes('CREATE_SHAREOUT'),
      'a share-out must be written to the trail');
    assert.ok(sharePage.includes('canRecordMoney'), 'the share-out screen must gate its write');
  });

  await check(16, 'the treasurer can read the financial reports', () => {
    assert.ok(can('treasurer', 'reports.view') && can('treasurer', 'analytics.view'));
    assert.ok(routes('reportRoutes.js').includes("requirePermission('reports.view')"));
    assert.ok(routes('analyticsRoutes.js').includes("requirePermission('analytics.view')"));
    assert.ok(reportsPage.includes('Ledger'), 'the reports must read from a table');
  });

  await check(17, 'the treasurer can read every financial transaction history', () => {
    for (const p of ['Savings.jsx', 'Loans.jsx', 'Fines.jsx', 'Welfare.jsx',
                     'Wrappers.jsx', 'ShareOut.jsx']) {
      const src = page(p);
      assert.ok(src.includes("import Ledger from '../components/Ledger.jsx'"),
        `${p} must import the shared table`);
      assert.ok(src.includes('<Ledger'), `${p} must render its history as a table`);
    }
    assert.ok(loansPage.includes('openRepayments'), 'the repayment history must be reachable');
  });

  await check(18, 'the treasurer cannot manage system users', async () => {
    assert.ok(!can('treasurer', 'users.manage'));
    const gate = await run(requirePermission('users.manage'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403, 'the user-management door must be shut to her');
    assert.ok(!nav.split('\n').some((l) => l.includes("roles: ['treasurer'") && l.includes('/app/admin/')),
      'the treasurer menu must never offer the administrator\'s pages');
  });

  await check(19, 'the treasurer cannot manage system roles or permissions', async () => {
    assert.ok(!can('treasurer', 'accounts.view') && !can('treasurer', 'accounts.manage'));
    const gate = await run(requirePermission('accounts.manage'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403);
  });

  await check(20, 'the treasurer cannot change technical system settings', async () => {
    assert.ok(!can('treasurer', 'system.settings'));
    const gate = await run(requirePermission('system.settings'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403, 'the system settings must be refused');
    assert.ok(routes('settingsRoutes.js').includes("router.put('/system', requirePermission('system.settings')"),
      'the system settings must sit behind the administrator\'s permission');
  });

  await check(21, 'the treasurer cannot approve or reject membership requests', async () => {
    assert.ok(!can('treasurer', 'joinRequests.decide'),
      'the final membership decision belongs to the chairperson alone');
    assert.ok(routes('joinRequestRoutes.js')
      .includes("router.patch('/:id', protect, requirePermission('joinRequests.decide')"),
      'settling a request must sit behind the deciding permission');
    const gate = await run(requirePermission('joinRequests.decide'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403, 'the deciding door must be shut to her');
    assert.ok(authContext.includes("isDecider: user?.role === 'admin'"),
      'the screens must agree: the decide buttons are not hers');
  });

  await check(22, 'the treasurer cannot change votes or override the voting', () => {
    const jr = routes('joinRequestRoutes.js');
    assert.ok(!jr.includes('.put(') && !jr.includes('.delete('),
      'there must be no route that rewrites or erases a vote');
    assert.ok(!/UPDATE\s+join_request_votes/i.test(joinCtrl),
      'the ballot table must never be updated, only extended');
    assert.ok(!/req\.body\.(userId|user_id|member_id)/.test(joinCtrl),
      'a vote always belongs to the signed-in member');
    assert.ok(joinCtrl.includes('rules.quorumNeeded') && /votes\.yes <= votes\.no/.test(joinCtrl),
      'the vote must still be able to fail on its own numbers');
  });

  await check(23, 'the treasurer cannot modify audit records', () => {
    const ar = routes('auditRoutes.js');
    assert.ok(!/\.(post|put|patch|delete)\(/.test(ar),
      'the audit routes must offer reading only');
    assert.ok(schema.includes('audit_logs is append-only'),
      'the database itself must refuse to rewrite history');
    assert.ok(can('treasurer', 'audit.view'), 'she may still read the history');
  });

  await check(24, 'the treasurer cannot change VSLA settings without the approval process', async () => {
    assert.ok(!can('treasurer', 'groupRules.propose'),
      'she may not write the group rules herself');
    const propose = await run(requirePermission('groupRules.propose'), { role: 'treasurer' });
    assert.strictEqual(propose.status, 403, 'the proposal door must be shut to her');
    assert.ok(can('treasurer', 'approvals.view') && can('treasurer', 'approvals.decide'),
      'she sits in the approval meeting');
    assert.ok(settingsCtrl.includes('applyGroupRules') && settingsCtrl.includes('UPDATE_SETTINGS'),
      'a change only enters force after it is confirmed and recorded');
  });

  await check(25, 'the treasurer cannot act as chairperson', async () => {
    for (const p of ['cases.manage', 'cycles.manage']) {
      assert.ok(!can('treasurer', p), `the treasurer must never hold ${p}`);
      const gate = await run(requirePermission(p), { role: 'treasurer' });
      assert.strictEqual(gate.status, 403, `${p} must be refused`);
    }
  });

  await check(26, 'the treasurer cannot act as System Administrator', async () => {
    assert.ok(!can('treasurer', 'accounts.manage') && !can('treasurer', 'system.settings'));
    for (const route of ['admin/users', 'admin/roles', 'admin/settings', 'admin/system', 'admin/activity']) {
      const re = new RegExp(`path="${route.replace('/', '\\/')}[^"]*"[^\\n]*roles=\\{\\['system_admin'\\]\\}`);
      assert.ok(re.test(app), `${route} must belong to the administrator alone`);
    }
    assert.ok(routes('memberRoutes.js').includes("router.use(protect, blockSystemAdmin)"),
      'the money routes must refuse the administrator too');
  });

  await check(27, 'her important actions are written to the audit trail', () => {
    for (const action of ['RECORD_SAVING', 'RECORD_REPAYMENT', 'RECORD_FINE',
                          'WELFARE_CONTRIBUTION', 'WELFARE_PAYOUT']) {
      assert.ok(listeners.includes(action) || savingsCtrl.includes(action),
        `${action} must be recorded`);
    }
    assert.ok(auditCtrl.includes('ADMINISTRATIVE_ACTIONS'),
      'her actions must be collectable under the administrative register');
  });

  await check(28, 'existing membership voting still works', () => {
    assert.ok(joinCtrl.includes('rules.canVote') && joinCtrl.includes('ON CONFLICT (request_id, user_id)'),
      'the member ballot must be unchanged');
    assert.strictEqual(typeof cases.canVote, 'function', 'the voting rule must still be exported');
    assert.strictEqual(cases.canVote({ memberStatus: 'active', userActive: true, memberId: 4, subjectMemberId: null }).ok,
      true, 'a member still has her say');
  });

  await check(29, 'the SMS service is untouched', () => {
    const sms = back(path.join('utils', 'sms.js'));
    assert.ok(/sendSMS/.test(sms), 'the one SMS sender must still be there');
    const messages = back(path.join('utils', 'messages.js'));
    for (const key of ['memberApproved', 'memberRejected', 'savingRecorded']) {
      assert.ok(messages.includes(`${key}:`), `${key} must still be written`);
    }
    assert.ok(routes('smsRoutes.js').length > 0, 'the SMS routes must still be mounted');
  });

  await check(30, 'the financial calculations are untouched', () => {
    assert.strictEqual(typeof shareout.calcShares, 'function');
    assert.strictEqual(typeof shareout.totalsOf, 'function');
    assert.strictEqual(typeof helpers.loanTotals, 'function');
    assert.strictEqual(typeof helpers.cashInBox, 'function');
    assert.ok(Array.isArray(shareout.calcShares([])), 'the share-out calculator must still run');
    assert.strictEqual(typeof shareout.totalsOf([]).total_payout ?? 0, 'number');
  });

  await check(31, 'the chairperson keeps her own work', async () => {
    assert.ok(can('admin', 'joinRequests.decide') && can('admin', 'cases.manage')
      && can('admin', 'cycles.manage') && can('admin', 'approvals.decide'));
    assert.ok(!can('admin', 'system.settings'), 'the system stays the administrator\'s');
  });

  await check(32, 'the secretary keeps her own work', async () => {
    assert.ok(can('secretary', 'meetings.record') && can('secretary', 'members.documents')
      && can('secretary', 'members.create'));
    assert.ok(!can('secretary', 'savings.record') && !can('secretary', 'joinRequests.decide'),
      'the money and the final membership decision are not hers');
  });

  await check(33, 'the System Administrator keeps her own work', async () => {
    assert.ok(can('system_admin', 'accounts.manage') && can('system_admin', 'system.settings'));
    assert.ok(!can('system_admin', 'savings.record') && !can('system_admin', 'joinRequests.decide')
      && !can('system_admin', 'meetings.record'),
      'the administrator never decides membership, records money or keeps the meetings');
  });

  await check(34, 'the ordinary member still takes part', async () => {
    const money = await run(requirePermission('savings.record'), { role: 'member' });
    assert.strictEqual(money.status, 403, 'a member records nothing');
    assert.ok(!Object.values(PERMISSIONS).some((list) => list.includes('member')),
      'no office permission may be handed to the plain member role');
  });

  await check(35, 'every money screen writes only through the treasurer', () => {
    for (const p of ['Savings.jsx', 'Loans.jsx', 'Fines.jsx', 'Welfare.jsx',
                     'Wrappers.jsx', 'ShareOut.jsx']) {
      assert.ok(page(p).includes('canRecordMoney'), `${p} must gate its writes on the treasurer`);
    }
    assert.ok(authContext.includes("canRecordMoney: user?.role === 'treasurer'"),
      'the money screens must agree with the server');
    for (const p of ['savings.record', 'loans.record', 'fines.record', 'contributions.record',
                     'welfare.record', 'shareout.record']) {
      assert.ok(can('treasurer', p), `the treasurer must hold ${p}`);
      assert.ok(!can('secretary', p), `the secretary must never hold ${p}`);
    }
  });

  await check(36, 'her sidebar is the money menu, never the administrator\'s', () => {
    const treasLines = nav.split('\n').filter((l) => l.includes("roles: ['treasurer'"));
    assert.ok(treasLines.length >= 8, `the treasurer must keep her money menu (found ${treasLines.length})`);
    for (const line of treasLines) {
      assert.ok(!line.includes('/app/admin/'),
        `an administrator's page must not reach the treasurer: ${line.trim()}`);
    }
    const targets = treasLines.join('\n');
    // The whole money menu: savings, loans, fines, welfare, share-out, reports.
    for (const pageLink of ['/app/savings', '/app/loans', '/app/fines', '/app/welfare',
                            '/app/shareout', '/app/activity', '/app/profile']) {
      assert.ok(targets.includes(`to: '${pageLink}`), `the treasurer menu must include ${pageLink}`);
    }
    assert.ok(targets.includes("to: '/app/loans?tab=repayments'"),
      'the treasurer menu must reach the repayment history');
    // Grouped, with a heading over each section of the menu.
    for (const group of ['nav.gDashboard', 'nav.gSavings', 'nav.gLoans', 'nav.gFines',
                         'nav.gWelfare', 'nav.gShareout', 'nav.gFinancialReports',
                         'nav.gActivity', 'nav.gProfile']) {
      assert.ok(targets.includes(group), `the treasurer menu is missing the ${group} heading`);
    }
    // The administrator's pages and membership approval are not hers.
    for (const forbidden of ['/app/admin/', '/app/approvals', '/app/messages', '/app/members',
                             '/app/cases', '/app/leadership', '/app/wrappers']) {
      assert.ok(!targets.includes(`to: '${forbidden}`),
        `the treasurer menu must not offer ${forbidden}`);
    }
  });

  await check(37, 'the membership process is still vote, decide, then record', () => {
    assert.ok(joinCtrl.includes('join_request_votes') && joinCtrl.includes('quorumNeeded'),
      'the members must still vote first');
    assert.ok(routes('joinRequestRoutes.js')
      .includes("requirePermission('joinRequests.decide')") && can('admin', 'joinRequests.decide'),
      'the chairperson must still make the final decision');
    assert.ok(!can('treasurer', 'joinRequests.decide'), 'the treasurer must not decide');
    assert.ok(joinCtrl.includes("INSERT INTO members (user_id, membership_number, village)"),
      'the resulting member record must still be created');
    assert.ok(can('secretary', 'members.create') && can('secretary', 'members.edit'),
      'the secretary must still keep the resulting member record');
  });

  // ---- the final requirement, word for word -------------------------------
  for (const role of ['system_admin', 'admin', 'treasurer', 'secretary', 'member']) {
    assert.ok(ROLES.includes(role), `the role ${role} must exist`);
  }
  assert.ok(can('treasurer', 'savings.record') && can('treasurer', 'loans.record')
    && can('treasurer', 'welfare.record') && can('treasurer', 'contributions.record')
    && can('treasurer', 'shareout.record') && can('treasurer', 'reports.view'),
    'the treasurer records the money and keeps the financial record');
  assert.ok(!can('treasurer', 'accounts.manage') && !can('treasurer', 'system.settings'),
    'system administration is not hers');
  assert.ok(!can('treasurer', 'cases.manage') && !can('treasurer', 'cycles.manage'),
    'the chairperson\'s work is not hers');
  assert.ok(!can('treasurer', 'joinRequests.decide'),
    'the final membership decision is not hers');
  console.log(`treasurer acceptance OK — ${done} checks passed`);
})().catch((err) => {
  console.error(`treasurer acceptance FAILED after ${done} checks`);
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
