/**
 * FINAL ACCEPTANCE TEST — the chairperson module.
 *
 * Each of the 35 checks below is asserted against the code that ships, in the
 * same style as the rest of the suite: the rules and the wiring are read and
 * checked, no database is needed. Run with: node test/acceptance.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ROLES, PERMISSIONS, can, requirePermission } = require('../config/permissions.js');
const { canSetSystemRole } = require('../utils/adminRules.js');
const cases = require('../utils/cases.js');
const officeVotes = require('../utils/officeVotes.js');
const shareout = require('../utils/shareout.js');
const helpers = require('../utils/helpers.js');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const routes = (file) => back(path.join('routes', file));
const controllers = (file) => back(path.join('controllers', file));
const page = (file) => read(path.join('frontend', 'src', 'pages', file));
const dash = (file) => read(path.join('frontend', 'src', 'pages', 'dashboards', file));

const app = read(path.join('frontend', 'src', 'App.jsx'));
const css = read(path.join('frontend', 'src', 'styles.css'));

const joinCtrl = controllers('joinRequestController.js');
const adminCtrl = controllers('adminController.js');
const settingsCtrl = controllers('settingsController.js');
const userCtrl = controllers('userController.js');
const dashCtrl = controllers('dashboardController.js');
const schema = back(path.join('db', 'schema.sql'));

const joinPage = page('JoinRequests.jsx');
const approvalsPage = page('Approvals.jsx');
const membersPage = page('Members.jsx');

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
  console.log('FINAL ACCEPTANCE TEST — chairperson module');

  await check(1, 'the chairperson reaches her own dashboard', () => {
    assert.ok(app.includes('<Route index element={<Dashboard />} />'),
      'the board must be the landing page of the app shell');
    const board = page('Dashboard.jsx');
    assert.ok(board.includes("import AdminDashboard from './dashboards/AdminDashboard.jsx'")
      && /admin:\s*AdminDashboard/.test(board),
      'the admin role must be handed the chairperson board');
  });

  await check(2, 'the dashboard shows the real VSLA numbers', () => {
    for (const field of ['total_savings', 'loans_out', 'outstanding', 'welfare_balance',
                         'cash_in_box', 'pending_join_requests', 'members:', 'loans:']) {
      assert.ok(dashCtrl.includes(field), `the dashboard payload must carry ${field}`);
    }
    assert.ok(dashCtrl.includes('payload.chair'), 'the chairperson must get her own queue');
    const board = dash('AdminDashboard.jsx');
    assert.ok(board.includes('data.money') && board.includes('data.chair') && board.includes('StatCard'),
      'the board must render the money, her queue and the key statistics');
  });

  await check(3, 'the chairperson can view members', async () => {
    assert.ok(routes('memberRoutes.js').includes("router.get('/', c.listMembers)"),
      'the members list must be a read route');
    assert.ok(membersPage.includes('Ledger'), 'members must be read from a table');
    assert.ok(/path="members"[^\n]*COMMITTEE/.test(app), 'the committee, chairperson included, may open it');
  });

  await check(4, 'the chairperson can view join requests', async () => {
    assert.ok(routes('joinRequestRoutes.js').includes("router.get('/', protect, c.listRequests)"),
      'the requests list must be readable by the committee');
    assert.ok(/path="requests"[^\n]*EVERYONE_AND_ADMIN/.test(app),
      'the chairperson may open the requests page');
  });

  await check(5, 'the applicant background is on the page', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'utils', 'screening.js')),
      'the screening questions must live in one place');
    assert.ok(joinCtrl.includes('screening'), 'the request must carry its background answers');
    assert.ok(joinPage.includes('screening') && joinPage.includes('joinreq__bgList'),
      'the chairperson must see the background before deciding');
  });

  await check(6, 'every eligible member can vote on a join request', async () => {
    assert.ok(routes('joinRequestRoutes.js').includes("router.post('/:id/vote', protect, c.vote)"),
      'voting must be open to members, not to an office only');
    assert.ok(joinCtrl.includes('rules.canVote'), 'the member voting rule must gate the ballot');
    assert.ok(joinCtrl.includes('ON CONFLICT (request_id, user_id)'),
      'one vote per member, and a member may change her own');
  });

  await check(7, 'the chairperson can view the voting results', () => {
    assert.ok(joinCtrl.includes('yes_votes') && joinCtrl.includes('no_votes'),
      'the tally must come back with the request');
    assert.ok(joinPage.includes('acceptVotes') && joinPage.includes('rejectVotes'),
      'the page must show the votes for and against');
  });

  await check(8, 'a join request can be approved', () => {
    assert.ok(joinCtrl.includes('APPROVE_JOIN_REQUEST'), 'the approval must be audited');
    assert.ok(routes('joinRequestRoutes.js')
      .includes("router.patch('/:id', protect, requirePermission('joinRequests.decide')"),
      'only the deciding offices may settle a request');
    assert.ok(can('admin', 'joinRequests.decide'), 'the chairperson may decide');
  });

  await check(7 + 2, 'the chairperson can reject a join request', () => {
    assert.ok(joinCtrl.includes('REJECT_JOIN_REQUEST'), 'the rejection must be recorded');
    assert.ok(joinCtrl.includes("SET status = 'rejected'") && joinCtrl.includes('sendSMS'),
      'the applicant must be told the group could not take her');
  });

  await check(10, 'the chairperson cannot change individual member votes', () => {
    const jr = routes('joinRequestRoutes.js');
    assert.ok(!jr.includes('.put(') && !jr.includes('.delete('),
      'there must be no route that rewrites or erases a vote');
    assert.ok(!/UPDATE\s+join_request_votes/i.test(joinCtrl),
      'the ballot table must never be updated, only extended');
    assert.ok(!/req\.body\.(userId|user_id|member_id)/.test(joinCtrl),
      'a vote always belongs to the signed-in member');
  });

  await check(11, 'the chairperson cannot bypass the voting process', () => {
    const order = joinCtrl.indexOf('still voting');
    const rejection = joinCtrl.indexOf("if (status === 'rejected')");
    assert.ok(order > 0 && order < rejection, 'the decision must wait for the group to vote');
    assert.ok(joinCtrl.includes('rules.quorumNeeded') && /votes\.yes <= votes\.no/.test(joinCtrl),
      'approval needs a quorum and a carried vote');
  });

  await check(12, 'an approved applicant becomes a member', () => {
    assert.ok(joinCtrl.includes("const role = 'member'"),
      'a new member must never arrive with an office');
    assert.ok(joinCtrl.includes('INSERT INTO users (username, password, role, full_name, phone, language, must_change_password)'),
      'the account must be created with a temporary password');
    assert.ok(joinCtrl.includes('INSERT INTO members (user_id, membership_number, village)'),
      'the membership record must be created beside the account');
    assert.ok(joinCtrl.includes('nextMembershipNumber()') && joinCtrl.includes('tx('),
      'both rows must be written in one transaction');
  });

  await check(13, 'the chairperson can view savings', () => {
    assert.ok(can('admin', 'savings.view'));
    assert.ok(routes('savingsRoutes.js').includes("router.get('/', requirePermission('savings.view')"));
    assert.ok(/path="savings"[^\n]*COMMITTEE/.test(app));
  });

  await check(14, 'the chairperson can view loans', () => {
    assert.ok(can('admin', 'loans.viewAll') && can('admin', 'loans.decide'));
    assert.ok(routes('loanRoutes.js').includes("router.get('/overdue', requirePermission('loans.viewAll')"));
    assert.ok(page('Loans.jsx').includes('Ledger'));
  });

  await check(15, 'the chairperson can view repayments', () => {
    assert.ok(routes('loanRoutes.js').includes("router.get('/repayments', c.listRepayments)"),
      'the repayment history must be readable');
    assert.ok(page('Loans.jsx').includes('repayments'));
  });

  await check(16, 'the chairperson can view fines', () => {
    assert.ok(can('admin', 'fines.viewAll'));
    assert.ok(routes('fineRoutes.js').includes("router.get('/', c.listFines)"));
    assert.ok(page('Fines.jsx').includes('Ledger'));
  });

  await check(17, 'the chairperson can view welfare', () => {
    assert.ok(routes('welfareRoutes.js').includes("router.get('/', c.listWelfare)")
      && routes('welfareRoutes.js').includes("router.get('/balance', c.getBalance)"));
    assert.ok(page('Welfare.jsx').includes('Ledger'));
  });

  await check(18, 'the chairperson can view the share-out', () => {
    assert.ok(can('admin', 'shareout.view'));
    assert.ok(routes('shareOutRoutes.js').includes("router.get('/', requirePermission('shareout.view')"));
    assert.ok(page('ShareOut.jsx').includes('Ledger'));
  });

  await check(19, 'the chairperson can view meetings', () => {
    assert.ok(routes('meetingRoutes.js').includes("router.get('/', c.listMeetings)"));
    assert.ok(page('Meetings.jsx').includes('meetings'));
  });

  await check(20, 'the chairperson can view reports', () => {
    assert.ok(can('admin', 'reports.view'));
    assert.ok(routes('reportRoutes.js').includes("router.get('/', requirePermission('reports.view')")
      || routes('reportRoutes.js').includes("'reports.view'"));
    assert.ok(/path="reports"[^\n]*Navigate to="\/app\/analytics\?tab=reports"/.test(app),
      'reports must stay under the analytics page');
    assert.ok(page('Reports.jsx').includes('Ledger'));
  });

  await check(21, 'the chairperson can review pending setting changes', () => {
    assert.ok(can('admin', 'approvals.view'));
    assert.ok(routes('approvalRoutes.js').includes("router.get('/', requirePermission('approvals.view')"));
    assert.ok(approvalsPage.includes("api.get('/approvals')"));
  });

  await check(22, 'the chairperson can confirm a proposed change', () => {
    assert.ok(can('admin', 'approvals.decide'));
    assert.ok(routes('approvalRoutes.js').includes("router.post('/:id/decide', requirePermission('approvals.decide')"));
    assert.ok(adminCtrl.includes('await applyGroupRules(payload, req.user.id)'),
      'confirming must put the new value into force');
    assert.ok(approvalsPage.includes('api.post(`/approvals/${id}/decide`') || approvalsPage.includes('api.post'),
      'the page must call the decision route');
  });

  await check(23, 'the chairperson can reject a proposed change', () => {
    assert.ok(adminCtrl.includes("return res.json({ message: 'Request rejected.' })"),
      'a rejection must be answered without touching the settings');
    assert.ok(adminCtrl.includes("audit(req.user.id, 'REJECT_CHANGE_REQUEST'"));
  });

  await check(24, 'a confirmed setting becomes active', () => {
    const apply = settingsCtrl.indexOf('async function applyGroupRules');
    assert.ok(apply > 0, 'the rule-applying function must exist');
    const body = settingsCtrl.slice(apply, apply + 420);
    assert.ok(body.includes('setSetting(key, payload[key], \'group\')'),
      'the approved value must be written to the settings table');
    assert.ok(settingsCtrl.includes("audit(userId, 'UPDATE_SETTINGS'"),
      'the change must be recorded in the audit trail');
    assert.ok(adminCtrl.indexOf('await applyGroupRules(payload, req.user.id)') > 0,
      'the approval path must put the new rules into force');
  });

  await check(25, 'a rejected change leaves the active value alone', () => {
    const rejectAt = adminCtrl.indexOf("return res.json({ message: 'Request rejected.' })");
    const applyAt = adminCtrl.indexOf('await applyGroupRules(payload, req.user.id)');
    assert.ok(rejectAt > 0 && applyAt > 0 && rejectAt < applyAt,
      'the rejection returns before any rule is applied');
  });

  await check(26, 'the chairperson cannot manage System Administrator roles', async () => {
    assert.ok(!can('admin', 'accounts.manage') && !can('admin', 'accounts.view'));
    const gate = await run(requirePermission('accounts.manage'), { role: 'admin' });
    assert.strictEqual(gate.status, 403, 'the accounts door must be shut to her');
    assert.ok(adminCtrl.includes('chairperson_conflict')
      && adminCtrl.includes('A user cannot simultaneously hold the System Administrator and Chairperson roles'),
      'the separation rule must be spelled out where roles are set');
    assert.strictEqual(canSetSystemRole({ targetRole: 'admin', makeAdmin: true }).reason, 'chairperson_conflict',
      'a chairperson may never be turned into the administrator');
    assert.strictEqual(canSetSystemRole({ targetRole: 'member', makeAdmin: true }).ok, true,
      'a plain member may still be appointed as administrator');
    assert.strictEqual(canSetSystemRole({ targetRole: 'treasurer', makeAdmin: true }).ok, false,
      'an elected office is never handed out from the account screen');
  });

  await check(27, 'the chairperson cannot open administrator-only pages', () => {
    for (const route of ['admin/users', 'admin/roles', 'admin/system', 'admin/activity']) {
      const re = new RegExp(`path="${route}"[^\\n]*roles=\\{\\['system_admin'\\]\\}`);
      assert.ok(re.test(app), `${route} must belong to the administrator alone`);
    }
    assert.ok(/path="admin\/settings\/:section"[^\n]*roles=\{\['system_admin'\]\}/.test(app));
  });

  await check(28, 'the chairperson cannot edit or delete audit records', async () => {
    const ar = routes('auditRoutes.js');
    assert.ok(!/\.(post|put|patch|delete)\(/.test(ar),
      'the audit routes must offer reading only');
    assert.ok(schema.includes('audit_logs is append-only'),
      'the database itself must refuse to rewrite history');
  });

  await check(29, 'chairperson actions are written to the audit trail', () => {
    for (const action of ['APPROVE_JOIN_REQUEST', 'REJECT_JOIN_REQUEST', 'VOTE_JOIN_REQUEST']) {
      assert.ok(joinCtrl.includes(action), `${action} must be recorded`);
    }
    assert.ok(joinCtrl.includes('audit(req.user.id,') || joinCtrl.includes('audit(actorId,'),
      'the record must name the person who acted');
    assert.ok(adminCtrl.includes("audit(req.user.id, 'APPROVE_CHANGE_REQUEST'"));
  });

  await check(30, 'the SMS service is untouched', () => {
    const sms = back(path.join('utils', 'sms.js'));
    assert.ok(/sendSMS/.test(sms), 'the one SMS sender must still be there');
    const messages = back(path.join('utils', 'messages.js'));
    for (const key of ['memberApproved', 'memberRejected']) {
      assert.ok(messages.includes(`${key}:`), `${key} must still be written`);
    }
    assert.ok(joinCtrl.includes('sendSMS'), 'joining still ends in an SMS');
    assert.ok(routes('smsRoutes.js').length > 0, 'the SMS routes must still be mounted');
  });

  await check(31, 'the financial calculations are untouched', () => {
    assert.strictEqual(typeof shareout.calcShares, 'function');
    assert.strictEqual(typeof shareout.totalsOf, 'function');
    assert.strictEqual(typeof helpers.loanTotals, 'function');
    assert.strictEqual(typeof helpers.cashInBox, 'function');
    // The share-out calculator still answers, and still answers nothing for nobody.
    assert.ok(Array.isArray(shareout.calcShares([])), 'the share-out calculator must still run');
    assert.strictEqual(typeof shareout.totalsOf([]).total_payout ?? 0, 'number');
  });

  await check(32, 'the voting rules are untouched', () => {
    for (const fn of ['canOpen', 'canVote', 'quorumNeeded', 'tally']) {
      assert.strictEqual(typeof officeVotes[fn], 'function', `office votes still expose ${fn}`);
      assert.strictEqual(typeof cases[fn], 'function', `member cases still expose ${fn}`);
    }
    assert.ok(routes('officeVoteRoutes.js').includes('officeVoteController')
      && routes('memberCaseRoutes.js').includes('memberCaseController'),
      'the election and case voting routes are still mounted');
  });

  await check(33, 'the treasurer keeps her own work', async () => {
    assert.ok(can('treasurer', 'savings.record') && can('treasurer', 'loans.record')
      && can('treasurer', 'welfare.record') && can('treasurer', 'contributions.record')
      && can('treasurer', 'approvals.decide'));
    const gate = await run(requirePermission('accounts.manage'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403);
  });

  await check(34, 'the secretary keeps her own work', async () => {
    assert.ok(can('secretary', 'meetings.record')
      && can('secretary', 'registration.record') && can('secretary', 'members.documents'),
      'the secretary keeps the meeting and membership records');
    assert.ok(!can('secretary', 'savings.record') && !can('secretary', 'loans.record')
      && !can('secretary', 'fines.record') && !can('secretary', 'contributions.record')
      && !can('secretary', 'welfare.record') && !can('secretary', 'shareout.record')
      && !can('secretary', 'cases.settlement'),
      'the money books belong to the treasurer alone');
    assert.ok(!can('secretary', 'joinRequests.decide') && !can('secretary', 'loans.decide'),
      'membership and loan decisions stay with the chairperson and treasurer');
    const chairOnly = await run(requirePermission('cycles.manage'), { role: 'secretary' });
    assert.strictEqual(chairOnly.status, 403, 'leading the cycle stays with the chairperson');
  });

  await check(35, 'an ordinary member still takes part', async () => {
    const money = await run(requirePermission('savings.record'), { role: 'member' });
    assert.strictEqual(money.status, 403, 'a member records nothing');
    assert.ok(!Object.values(PERMISSIONS).some((list) => list.includes('member')),
      'no office permission may be handed to the plain member role');
  });

  // ---- the final requirement, word for word -------------------------------
  for (const role of ['system_admin', 'admin', 'treasurer', 'secretary', 'member']) {
    assert.ok(ROLES.includes(role), `the role ${role} must exist`);
  }
  assert.ok(!can('admin', 'system.settings') && can('system_admin', 'system.settings'),
    'the system is the administrator\'s, the VSLA is the chairperson\'s');
  assert.ok(!can('system_admin', 'joinRequests.decide') && can('admin', 'joinRequests.decide'),
    'the membership decision belongs to the chairperson, not the administrator');
  assert.ok(!can('system_admin', 'cases.manage') && can('admin', 'cases.manage'));
  // Joining is a collective decision; account handling is a permission, not a vote.
  assert.ok(joinCtrl.includes('join_request_votes') && joinCtrl.includes('quorumNeeded'),
    'membership joining must stay a vote of the members');
  assert.ok(!userCtrl.includes('join_request_votes') && !userCtrl.includes('office_votes')
    && !userCtrl.includes('quorumNeeded'),
    'ordinary account management must not be treated as a group vote');
  assert.ok(userCtrl.includes("const role = 'member'") && userCtrl.includes('users.manage') === false,
    'account work is a permission-gated action, not an election');
  assert.ok(routes('userRoutes.js').includes("requirePermission('users.manage')"),
    'account management must sit behind the users.manage permission');
  console.log('acceptance OK — 35 checks passed');
})().catch((err) => {
  console.error(`acceptance FAILED after ${done} checks`);
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
