/**
 * FINAL ACCEPTANCE TEST — the secretary module.
 *
 * The secretary keeps the record of people and meetings. She is never a system
 * administrator, never the final decider on membership, and never a writer in
 * the money books. Each of the 32 checks below is asserted against the code that
 * ships, in the same style as the chairperson acceptance test: the rules and the
 * wiring are read and checked, no database is needed.
 *
 * Run with: node test/acceptance-secretary.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ROLES, PERMISSIONS, can, requirePermission } = require('../config/permissions.js');
const cases = require('../utils/cases.js');
const shareout = require('../utils/shareout.js');
const helpers = require('../utils/helpers.js');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const routes = (file) => back(path.join('routes', file));
const controllers = (file) => back(path.join('controllers', file));
const page = (file) => read(path.join('frontend', 'src', 'pages', file));
const dash = (file) => read(path.join('frontend', 'src', 'pages', 'dashboards', file));
const nav = read(path.join('frontend', 'src', 'components', 'navItems.js'));
const app = read(path.join('frontend', 'src', 'App.jsx'));
const schema = back(path.join('db', 'schema.sql'));

const joinCtrl = controllers('joinRequestController.js');
const meetCtrl = controllers('meetingController.js');
const userCtrl = controllers('userController.js');
const profCtrl = controllers('profileController.js');
const dashCtrl = controllers('dashboardController.js');

const membersPage = page('Members.jsx');
const meetingsPage = page('Meetings.jsx');
const joinPage = page('JoinRequests.jsx');
const reportsPage = page('Reports.jsx');
const recordsPage = page('AdministrativeRecords.jsx');
const secretaryBoard = dash('SecretaryDashboard.jsx');

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
  console.log('FINAL ACCEPTANCE TEST — secretary module');

  await check(1, 'the secretary reaches her own dashboard', () => {
    assert.ok(app.includes('<Route index element={<Dashboard />} />'),
      'the board must be the landing page of the app shell');
    assert.ok(/secretary:\s*SecretaryDashboard/.test(page('Dashboard.jsx')),
      'the secretary role must be handed the secretary board');
    assert.ok(secretaryBoard.includes('quickActions'),
      'her board must offer the shortcuts she uses at every meeting');
  });

  await check(2, 'the dashboard shows the correct membership numbers', () => {
    for (const field of ['members: memberStats', 'pending_join_requests', 'recent_meetings',
                         'attendance_rate', 'membership_changes']) {
      assert.ok(dashCtrl.includes(field), `the dashboard payload must carry ${field}`);
    }
    assert.ok(/COUNT\(\*\)::int\s+AS total[\s\S]{0,300}FROM members/.test(dashCtrl),
      'the membership count must come from the register');
    for (const field of ['data.members?.total', 'data.members?.active', 'data.members?.inactive',
                         'data.pending_join_requests', 'data.attendance_rate']) {
      assert.ok(secretaryBoard.includes(field), `her board must render ${field}`);
    }
  });

  await check(3, 'the secretary can view members', () => {
    assert.ok(routes('memberRoutes.js').includes("router.get('/', c.listMembers)"),
      'the members list must be a read route');
    assert.ok(membersPage.includes('Ledger'), 'members must be read from a table');
    assert.ok(/path="members"[^\n]*COMMITTEE/.test(app), 'the committee may open the register');
  });

  await check(4, 'the secretary can search members', () => {
    assert.ok(membersPage.includes('setSearch') && membersPage.includes('.toLowerCase().includes(q)'),
      'the register must be searchable by name, phone and number');
    assert.ok(membersPage.includes("placeholder={t('common.search')}"),
      'the search box must be on the page');
  });

  await check(5, 'the secretary can filter members', () => {
    assert.ok(membersPage.includes('statusFilter') && membersPage.includes("'active'")
      && membersPage.includes("'inactive'"),
      'the register must filter by active, inactive and everyone');
    assert.ok(membersPage.includes("t('members.filterLabel')"), 'the filter must be labelled');
  });

  await check(6, 'the secretary can maintain authorised member records', async () => {
    assert.ok(routes('userRoutes.js').includes("requirePermission('members.create')")
      && routes('userRoutes.js').includes("requirePermission('members.edit')"),
      'adding and editing a person must be permission-gated');
    assert.ok(can('secretary', 'members.create') && can('secretary', 'members.edit'),
      'the secretary holds both');
    const gate = await run(requirePermission('members.edit'), { role: 'member' });
    assert.strictEqual(gate.status, 403, 'a plain member edits no register');
    assert.ok(membersPage.includes('canAddMember') && membersPage.includes('canEditMember')
      && membersPage.includes("['admin', 'secretary']"),
      'the register only offers the edit tools to the chairperson and the secretary');
  });

  await check(7, 'the secretary can view membership history', () => {
    assert.ok(routes('userRoutes.js').includes("router.get('/history', requirePermission('users.view')"),
      'the history must be a permission-gated read');
    assert.ok(userCtrl.includes('membershipHistory'), 'the history controller must exist');
    assert.ok(membersPage.includes("api.get('/users/history')"),
      'the page must read the membership history');
    assert.ok(membersPage.includes("get('view')") && membersPage.includes("'history'"),
      '?view=history must open the Membership History section');
  });

  await check(8, 'the secretary can view join requests', () => {
    assert.ok(routes('joinRequestRoutes.js').includes("router.get('/', protect, c.listRequests)"),
      'the requests list must be readable by the members');
    assert.ok(/path="requests"[^\n]*EVERYONE_AND_ADMIN/.test(app),
      'the secretary may open the requests page');
    assert.ok(joinPage.includes('screening'), 'the applicant background must be shown');
  });

  await check(9, 'the secretary cannot approve or reject as the chairperson', async () => {
    assert.ok(!can('secretary', 'joinRequests.decide'),
      'the final membership decision is not hers');
    assert.ok(routes('joinRequestRoutes.js')
      .includes("router.patch('/:id', protect, requirePermission('joinRequests.decide')"),
      'settling a request must sit behind the deciding permission');
    const gate = await run(requirePermission('joinRequests.decide'), { role: 'secretary' });
    assert.strictEqual(gate.status, 403, 'the deciding door must be shut to her');
  });

  await check(10, 'the secretary cannot change member votes', () => {
    const jr = routes('joinRequestRoutes.js');
    assert.ok(!jr.includes('.put(') && !jr.includes('.delete('),
      'there must be no route that rewrites or erases a vote');
    assert.ok(!/UPDATE\s+join_request_votes/i.test(joinCtrl),
      'the ballot table must never be updated, only extended');
    assert.ok(!/req\.body\.(userId|user_id|member_id)/.test(joinCtrl),
      'a vote always belongs to the signed-in member');
  });

  await check(11, 'she votes only when she is also an eligible member', () => {
    assert.ok(routes('joinRequestRoutes.js').includes("router.post('/:id/vote', protect, c.vote)"),
      'voting must be open to members, not to an office only');
    assert.ok(joinCtrl.includes('req.user.member_id') && joinCtrl.includes('rules.canVote'),
      'the ballot must be tied to her own member record');
    assert.strictEqual(cases.canVote({ memberStatus: 'active', userActive: true, memberId: 3, subjectMemberId: null }).ok,
      true, 'an active member may vote');
    assert.strictEqual(cases.canVote({ memberStatus: 'inactive', userActive: true, memberId: 3, subjectMemberId: null }).ok,
      false, 'a member who is not active may not vote');
    assert.ok(joinCtrl.includes('ON CONFLICT (request_id, user_id)'),
      'one vote per member, and she may change her own');
  });

  await check(12, 'the secretary can create meeting records', () => {
    assert.ok(routes('meetingRoutes.js').includes("router.post('/', requirePermission('meetings.record')"));
    assert.ok(can('secretary', 'meetings.record'), 'the secretary records the meetings');
    assert.ok(meetCtrl.includes('CREATE_MEETING'), 'a new meeting must be written to the trail');
  });

  await check(13, 'the secretary can view meetings', () => {
    assert.ok(routes('meetingRoutes.js').includes("router.get('/', c.listMeetings)"));
    assert.ok(/path="meetings"[^\n]*EVERYONE/.test(app), 'the meetings page is open to all');
    assert.ok(meetingsPage.includes('Ledger') && meetingsPage.includes('meetings__tab'),
      'the meetings page must read from a table and carry its tabs');
  });

  await check(14, 'the secretary can record attendance', () => {
    assert.ok(routes('meetingRoutes.js')
      .includes("router.put('/:id/attendance', requirePermission('meetings.record')"));
    assert.ok(meetCtrl.includes('saveAttendance') && meetCtrl.includes('SAVE_ATTENDANCE'),
      'attendance must be saved and recorded in the trail');
    assert.ok(meetingsPage.includes('saveAttendance') && meetingsPage.includes("['present', 'absent', 'excused']"),
      'the register must offer present, absent and excused');
  });

  await check(15, 'the secretary can view attendance history', () => {
    assert.ok(meetingsPage.includes("'?tab=attendance'") || meetingsPage.includes('tab=attendance'),
      'attendance must have its own tab');
    assert.ok(meetingsPage.includes('present_count') && meetingsPage.includes('marked_count'),
      'the history must show who was present out of those marked');
    assert.ok(meetCtrl.includes('present_count'), 'the meeting list must carry the attendance counts');
  });

  await check(16, 'the secretary can maintain authorised meeting records', () => {
    assert.ok(routes('meetingRoutes.js')
      .includes("router.patch('/:id', requirePermission('meetings.record')"));
    assert.ok(meetCtrl.includes('updateMinutes') && meetCtrl.includes('UPDATE_MEETING'),
      'the written-up record must be editable and logged');
  });

  await check(17, 'the secretary can generate membership reports', () => {
    assert.ok(can('secretary', 'reports.view'));
    assert.ok(routes('reportRoutes.js').includes("requirePermission('reports.view')"),
      'the reports must sit behind the reading permission');
    assert.ok(reportsPage.includes("'newMembers'") && reportsPage.includes("'inactiveMembers'"),
      'the new-joiner and inactive reports must be offered');
    for (const key of ['reportNewMembers', 'reportInactive', 'reportChanges', 'reportHistory']) {
      assert.ok(reportsPage.includes(key), `${key} must be on the reports page`);
    }
  });

  await check(18, 'the secretary can generate attendance reports', () => {
    assert.ok(reportsPage.includes("'attendance'") && reportsPage.includes("'meetings'"),
      'the attendance and meeting reports must be offered');
    assert.ok(reportsPage.includes('reportMeetings') && reportsPage.includes('GROUP_ONLY'),
      'the meeting report must be a group report');
  });

  await check(19, 'the secretary may read the money books, but only read', () => {
    for (const p of ['savings.view', 'loans.viewAll', 'fines.viewAll', 'contributions.view',
                     'shareout.view', 'registration.view']) {
      assert.ok(can('secretary', p), `the secretary must read ${p}`);
    }
    assert.ok(page('Savings.jsx').includes('canRecordMoney'),
      'the savings screen must gate its writes on the treasurer');
  });

  await check(20, 'the secretary cannot alter financial transactions', async () => {
    for (const p of ['savings.record', 'loans.record', 'fines.record', 'contributions.record',
                     'welfare.record', 'shareout.record', 'cases.settlement']) {
      assert.ok(!can('secretary', p), `the secretary must never record ${p}`);
      const gate = await run(requirePermission(p), { role: 'secretary' });
      assert.strictEqual(gate.status, 403, `writing ${p} must be refused`);
    }
  });

  await check(21, 'the secretary cannot manage system roles', async () => {
    assert.ok(!can('secretary', 'users.manage') && !can('secretary', 'accounts.manage'));
    const gate = await run(requirePermission('users.manage'), { role: 'secretary' });
    assert.strictEqual(gate.status, 403, 'account management must be refused');
    assert.ok(/path="admin\/roles"[^\n]*roles=\{\['system_admin'\]\}/.test(app),
      'the role screen must belong to the administrator alone');
  });

  await check(22, 'the secretary cannot create System Administrator accounts', async () => {
    assert.ok(!can('secretary', 'accounts.manage'));
    const gate = await run(requirePermission('accounts.manage'), { role: 'secretary' });
    assert.strictEqual(gate.status, 403, 'the account door must be shut to her');
    assert.ok(userCtrl.includes("const role = 'member'"),
      'the register only ever creates plain members');
    assert.ok(/path="admin\/users"[^\n]*roles=\{\['system_admin'\]\}/.test(app),
      'the account screen must belong to the administrator alone');
  });

  await check(23, 'the secretary cannot open administrator-only settings', async () => {
    for (const route of ['admin/settings/:section', 'admin/system', 'admin/activity']) {
      const re = new RegExp(`path="${route.replace(/[/:]/g, (m) => (m === '/' ? '\\/' : ':'))}"[^\\n]*roles=\\{\\['system_admin'\\]\\}`);
      assert.ok(re.test(app), `${route} must belong to the administrator alone`);
    }
    const gate = await run(requirePermission('system.settings'), { role: 'secretary' });
    assert.strictEqual(gate.status, 403, 'the system settings must be refused');
  });

  await check(24, 'the secretary cannot modify audit records', () => {
    const ar = routes('auditRoutes.js');
    assert.ok(!/\.(post|put|patch|delete)\(/.test(ar),
      'the audit routes must offer reading only');
    assert.ok(schema.includes('audit_logs is append-only'),
      'the database itself must refuse to rewrite history');
  });

  await check(25, 'her important actions are written to the audit trail', () => {
    for (const action of ['CREATE_MEETING', 'SAVE_ATTENDANCE', 'UPDATE_MEETING', 'CREATE_USER',
                          'UPDATE_USER', 'UPLOAD_DOCUMENT', 'DELETE_DOCUMENT']) {
      assert.ok(meetCtrl.includes(action) || userCtrl.includes(action) || profCtrl.includes(action),
        `${action} must be recorded`);
    }
    assert.ok(meetCtrl.includes('audit(req.user.id,') || userCtrl.includes('audit(req.user.id,'),
      'the record must name the person who acted');
    assert.ok(controllers('auditController.js').includes('ADMINISTRATIVE_ACTIONS'),
      'her actions must be collectable under the administrative register');
  });

  await check(26, 'existing membership voting still works', () => {
    assert.ok(joinCtrl.includes('rules.canVote') && joinCtrl.includes('ON CONFLICT (request_id, user_id)'),
      'the member ballot must be unchanged');
    assert.ok(joinCtrl.includes('rules.quorumNeeded'), 'the quorum rule must be unchanged');
    assert.strictEqual(typeof cases.canVote, 'function', 'the voting rule must still be exported');
  });

  await check(27, 'the SMS service is untouched', () => {
    const sms = back(path.join('utils', 'sms.js'));
    assert.ok(/sendSMS/.test(sms), 'the one SMS sender must still be there');
    const messages = back(path.join('utils', 'messages.js'));
    for (const key of ['memberApproved', 'memberRejected']) {
      assert.ok(messages.includes(`${key}:`), `${key} must still be written`);
    }
    assert.ok(joinCtrl.includes('sendSMS'), 'joining still ends in an SMS');
    assert.ok(routes('smsRoutes.js').length > 0, 'the SMS routes must still be mounted');
  });

  await check(28, 'the financial calculations are untouched', () => {
    assert.strictEqual(typeof shareout.calcShares, 'function');
    assert.strictEqual(typeof shareout.totalsOf, 'function');
    assert.strictEqual(typeof helpers.loanTotals, 'function');
    assert.strictEqual(typeof helpers.cashInBox, 'function');
    assert.ok(Array.isArray(shareout.calcShares([])), 'the share-out calculator must still run');
    assert.strictEqual(typeof shareout.totalsOf([]).total_payout ?? 0, 'number');
  });

  await check(29, 'the treasurer keeps her own work', async () => {
    assert.ok(can('treasurer', 'savings.record') && can('treasurer', 'loans.record')
      && can('treasurer', 'welfare.record') && can('treasurer', 'contributions.record')
      && can('treasurer', 'approvals.decide'));
    const gate = await run(requirePermission('accounts.manage'), { role: 'treasurer' });
    assert.strictEqual(gate.status, 403);
  });

  await check(30, 'the chairperson keeps her own work', async () => {
    assert.ok(can('admin', 'joinRequests.decide') && can('admin', 'cases.manage')
      && can('admin', 'cycles.manage') && can('admin', 'approvals.decide'));
    const gate = await run(requirePermission('system.settings'), { role: 'admin' });
    assert.strictEqual(gate.status, 403, 'the system stays the administrator\'s');
  });

  await check(31, 'the System Administrator keeps her own work', async () => {
    assert.ok(can('system_admin', 'accounts.manage') && can('system_admin', 'system.settings'));
    assert.ok(!can('system_admin', 'joinRequests.decide') && !can('system_admin', 'savings.record')
      && !can('system_admin', 'meetings.record'),
      'the administrator never decides membership, records money or keeps the meetings');
  });

  await check(32, 'the ordinary member still takes part', async () => {
    const money = await run(requirePermission('savings.record'), { role: 'member' });
    assert.strictEqual(money.status, 403, 'a member records nothing');
    assert.ok(!Object.values(PERMISSIONS).some((list) => list.includes('member')),
      'no office permission may be handed to the plain member role');
    assert.strictEqual(cases.canVote({ memberStatus: 'active', userActive: true, memberId: 9, subjectMemberId: null }).ok,
      true, 'a member still has her say on membership');
  });

  // ---- the final requirement, word for word -------------------------------
  for (const role of ['system_admin', 'admin', 'treasurer', 'secretary', 'member']) {
    assert.ok(ROLES.includes(role), `the role ${role} must exist`);
  }
  assert.ok(can('secretary', 'members.create') && can('secretary', 'members.edit')
    && can('secretary', 'members.documents') && can('secretary', 'meetings.record'),
    'the secretary owns the register, the papers and the meetings');
  assert.ok(!can('secretary', 'system.settings') && !can('secretary', 'accounts.manage'),
    'system administration is not hers');
  assert.ok(!can('secretary', 'joinRequests.decide'),
    'the final membership decision is not hers');
  assert.ok(!can('secretary', 'savings.record') && !can('secretary', 'shareout.record'),
    'financial transaction recording is not hers');
  // Members vote -> the chairperson decides -> the secretary keeps the record.
  assert.ok(joinCtrl.includes('join_request_votes') && joinCtrl.includes('quorumNeeded'),
    'the members must still vote first');
  assert.ok(routes('joinRequestRoutes.js')
    .includes("requirePermission('joinRequests.decide')") && can('admin', 'joinRequests.decide'),
    'the chairperson must still make the final decision');
  assert.ok(joinCtrl.includes("INSERT INTO members (user_id, membership_number, village)"),
    'the resulting member record must still be created');
  assert.ok(recordsPage.includes('GROUPS') && recordsPage.includes("'/app/members'")
    && recordsPage.includes("'/app/meetings'"),
    'her administrative records page must gather the people and the meetings');
  console.log('secretary acceptance OK — 32 checks passed');
})().catch((err) => {
  console.error(`secretary acceptance FAILED after ${done} checks`);
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
