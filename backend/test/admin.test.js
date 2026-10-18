const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ROLES, PERMISSIONS, MONEY_PERMISSIONS, can, touchesMoney, requirePermission, blockSystemAdmin, OFFICES,
} = require('../config/permissions.js');
const { canDecideChange, canRemoveAdministrator, canSetSystemRole, canManageAccount, resetAttempt } = require('../utils/adminRules.js');

// Run one express middleware with a fake user and see what it answers.
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

(async () => {
  // ---- the permission file is well formed ---------------------------------
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    for (const role of roles) {
      assert.ok(ROLES.includes(role), `${perm} names an unknown role: ${role}`);
    }
  }

  // ---- the system administrator gets 403 on every money endpoint ----------
  assert.strictEqual(touchesMoney('system_admin'), false, 'the administrator must hold no money permission');
  for (const perm of MONEY_PERMISSIONS) {
    assert.strictEqual(can('system_admin', perm), false, `system_admin must not hold ${perm}`);
  }
  // ...and the guard really refuses, both by permission and by the money fence.
  const byPerm = await run(requirePermission('savings.view'), { role: 'system_admin' });
  assert.strictEqual(byPerm.status, 403);
  const byFence = await run(blockSystemAdmin, { role: 'system_admin' });
  assert.strictEqual(byFence.status, 403);
  // A treasurer is allowed where the administrator is not.
  const treasurer = await run(requirePermission('savings.view'), { role: 'treasurer' });
  assert.strictEqual(treasurer.passed, true);
  // The chairperson may not open the system settings; only the administrator may.
  const chairSystem = await run(requirePermission('system.settings'), { role: 'admin' });
  assert.strictEqual(chairSystem.status, 403);

  // ---- nobody confirms their own change -----------------------------------
  const own = canDecideChange({
    status: 'pending', approverRoleRequired: 'admin', approverRole: 'admin',
    requestedById: 7, approverId: 7,
  });
  assert.strictEqual(own.ok, false);
  assert.strictEqual(own.reason, 'own_request');

  const someoneElse = canDecideChange({
    status: 'pending', approverRoleRequired: 'admin', approverRole: 'admin',
    requestedById: 7, approverId: 9,
  });
  assert.strictEqual(someoneElse.ok, true);

  const wrongRole = canDecideChange({
    status: 'pending', approverRoleRequired: 'admin', approverRole: 'treasurer',
    requestedById: 7, approverId: 9,
  });
  assert.strictEqual(wrongRole.reason, 'wrong_role');

  const already = canDecideChange({
    status: 'approved', approverRoleRequired: 'admin', approverRole: 'admin',
    requestedById: 7, approverId: 9,
  });
  assert.strictEqual(already.reason, 'already_decided');

  // ---- the last administrator cannot be removed ---------------------------
  assert.strictEqual(canRemoveAdministrator({ targetIsAdmin: true, activeAdministrators: 1 }).ok, false);
  assert.strictEqual(canRemoveAdministrator({ targetIsAdmin: true, activeAdministrators: 2 }).ok, true);
  assert.strictEqual(canRemoveAdministrator({ targetIsAdmin: false, activeAdministrators: 1 }).ok, true);
  assert.strictEqual(canRemoveAdministrator({ targetIsAdmin: true, activeAdministrators: 0 }).reason, 'last_admin');

  // ---- the administrator may hand out the system role, and nothing else ----
  assert.strictEqual(canSetSystemRole({ targetRole: 'member', makeAdmin: true, activeAdministrators: 1 }).ok, true);
  assert.strictEqual(canSetSystemRole({ targetRole: 'system_admin', makeAdmin: false, activeAdministrators: 2 }).ok, true);
  assert.strictEqual(canSetSystemRole({ targetRole: 'admin', makeAdmin: false, activeAdministrators: 2 }).reason, 'is_office');
  // The chairperson may never also be a system administrator.
  assert.strictEqual(canSetSystemRole({ targetRole: 'admin', makeAdmin: true, activeAdministrators: 2 }).reason, 'chairperson_conflict');
  assert.strictEqual(canSetSystemRole({ targetRole: 'treasurer', makeAdmin: true, activeAdministrators: 2 }).reason, 'is_office');
  assert.strictEqual(canSetSystemRole({ targetRole: 'system_admin', makeAdmin: true, activeAdministrators: 1 }).reason, 'already_admin');
  assert.strictEqual(canSetSystemRole({ targetRole: 'member', makeAdmin: false, activeAdministrators: 1 }).reason, 'not_admin');
  assert.strictEqual(canSetSystemRole({ targetRole: 'system_admin', makeAdmin: false, activeAdministrators: 1 }).reason, 'last_admin');

  // ---- the administrator never changes the group's rules on her own --------
  const settings = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'settingsController.js'), 'utf8');
  assert.ok(
    settings.includes("req.user.role === 'system_admin' ? 'admin' : 'treasurer'"),
    'a VSLA settings change by the administrator must be proposed to the chairperson'
  );
  assert.ok(!/if \(req\.user\.role === 'system_admin'\)\s*\{\s*\n\s*await applyGroupRules/.test(settings),
    'the administrator must not save VSLA rules directly');

  // ---- the office screens never reach the administrator's account -----------
  // The chairperson may not edit, reset, lock or suspend the System
  // Administrator's account, and nobody changes their own role from here.
  assert.strictEqual(canManageAccount({ actorId: 3, targetId: 16, targetRole: 'system_admin' }).reason, 'system_admin_account');
  assert.strictEqual(canManageAccount({ actorId: 3, targetId: 7, targetRole: 'admin', newRole: 'member' }).ok, true);
  assert.strictEqual(canManageAccount({ actorId: 7, targetId: 7, targetRole: 'admin', newRole: 'member' }).reason, 'own_role');
  assert.strictEqual(canManageAccount({ actorId: 7, targetId: 7, targetRole: 'admin', newRole: 'admin' }).ok, true);

  const userCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'userController.js'), 'utf8');
  assert.ok(userCtrl.includes('canManageAccount'), 'the user route must consult the account guard');
  const guarded = userCtrl.match(/refuseAccount\(req, res/g) || [];
  assert.ok(guarded.length >= 6, `every account action must be guarded (found ${guarded.length})`);

  // ---- a vote belongs to a member, on every vote route ---------------------
  const joinCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'joinRequestController.js'), 'utf8');
  assert.ok(joinCtrl.includes('rules.canVote'), 'a join-request vote must use the member voting rule');
  assert.ok(joinCtrl.includes("if (!me) return res.status(403)"), 'a voter with no member record must be refused');

  // ---- the final role structure -------------------------------------------
  // Administrator + member is allowed: the voting pages open for her and the
  // votes themselves are keyed to the member row, never to the role.
  assert.ok(!OFFICES.includes('system_admin'),
    'the system role is not one of the three offices');
  const appJsx = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'App.jsx'), 'utf8');
  const routeLine = (name) => appJsx.split('\n').find((l) => l.includes(`path="${name}"`)) || '';
  assert.ok(routeLine('cases').includes('EVERYONE_AND_ADMIN'), 'a member-administrator must reach the case votes');
  assert.ok(routeLine('leadership').includes('EVERYONE_AND_ADMIN'), 'a member-administrator must reach the office votes');
  assert.ok(routeLine('requests').includes('EVERYONE_AND_ADMIN'), 'a member-administrator must reach the join-request votes');
  assert.ok(!routeLine('loans').includes('EVERYONE_AND_ADMIN'), 'the money pages stay closed to the administrator');
  assert.ok(!routeLine('savings').includes('EVERYONE_AND_ADMIN'), 'the money pages stay closed to the administrator');
  // ...and the Chairperson seat is refused with the wording from the spec.
  const adminCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'adminController.js'), 'utf8');
  assert.ok(
    adminCtrl.includes('A user cannot simultaneously hold the System Administrator and Chairperson roles'),
    'the administrator–chairperson conflict must say so in the exact words'
  );

  // ---- the chairperson's own module ---------------------------------------
  // She leads the group: decides joins, carries out votes, confirms rules.
  for (const perm of ['cases.manage', 'officeVotes.manage', 'joinRequests.decide',
                      'approvals.decide', 'groupRules.view', 'groupRules.propose',
                      'cycles.manage', 'audit.view']) {
    assert.ok(can('admin', perm), `the chairperson must hold ${perm}`);
  }
  // ...and she is never the system administrator.
  for (const perm of ['accounts.view', 'accounts.manage', 'system.settings']) {
    assert.ok(!can('admin', perm), `the chairperson must not hold ${perm}`);
  }
  const chairAccounts = await run(requirePermission('accounts.manage'), { role: 'admin' });
  assert.strictEqual(chairAccounts.status, 403);
  // Her board carries the queue of what is hers to settle.
  const dashCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'dashboardController.js'), 'utf8');
  assert.ok(dashCtrl.includes('pending_rule_changes'), 'the chair board must show the rule changes to confirm');
  assert.ok(dashCtrl.includes("kind = 'group_rules'"), 'the chair queue must ask for the pending group-rule changes');
  assert.ok(dashCtrl.includes('cases_to_carry'), 'the chair board must show the votes waiting to be carried out');
  const chairDash = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'dashboards', 'AdminDashboard.jsx'), 'utf8');
  assert.ok(chairDash.includes('chair.queueTitle'), 'the chairperson dashboard must open with her decision queue');

  // ---- the seven summary cards, fed by real figures -----------------------
  assert.ok(dashCtrl.includes('AS total') && dashCtrl.includes('FROM members'),
    'the member count must come from the members table');
  assert.ok(dashCtrl.includes('rule_changes_waiting'), 'the pending-configuration count must be asked for');
  for (const card of ['admin.totalMembers', 'dashboard.activeMembers', 'dashboard.pendingRequests',
                      'dashboard.totalSavings', 'dashboard.activeLoans', 'dashboard.groupOutstanding',
                      'admin.pendingConfigChanges']) {
    assert.ok(chairDash.includes(card), `the chair board must show the ${card} card`);
  }
  // No card invents a figure: every value reads from the dashboard payload.
  assert.ok(chairDash.includes('data.members?.total'), 'total members must read the real count');

  // ---- the highlighted pending action and the quick actions ---------------
  for (const qa of ['chair.qaReviewRequests', 'chair.qaViewMembers', 'chair.qaViewLoans',
                    'chair.qaViewSavings', 'chair.qaViewRepayments', 'chair.qaViewReports',
                    'chair.qaReviewSettings', 'chair.qaViewMeetings']) {
    assert.ok(chairDash.includes(qa), `the chair board must offer the ${qa} quick action`);
  }
  assert.ok(chairDash.includes('chair__alert'), 'the most important pending action must be highlighted');
  assert.ok(
    chairDash.indexOf('chair.alertJoins') < chairDash.indexOf('chair.alertRules')
      && chairDash.indexOf('chair.alertRules') < chairDash.indexOf('chair.alertCarry'),
    'people waiting to join must be highlighted before anything else'
  );

  // ---- membership decisions, kept apart from technical user management ----
  const membersPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Members.jsx'), 'utf8');
  assert.ok(membersPage.includes('members.historyTitle') && membersPage.includes("/members/"),
    'a member profile must carry her membership history');
  assert.ok(!membersPage.includes('/accounts') && !membersPage.includes('/roles'),
    'the members page must never touch accounts or system roles');
  const joinPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'JoinRequests.jsx'), 'utf8');
  assert.ok(joinPage.includes('screening') && joinPage.includes('yes_votes'),
    'the chairperson must see the applicant background and the voting results');
  assert.ok(joinPage.includes("'approved'") && joinPage.includes("'rejected'"),
    'join requests must be approvable and rejectable');
  // The voting record cannot be rewritten: one ballot per person, kept forever.
  const schemaVotes = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.ok(/UNIQUE\s*\(\s*case_id\s*,\s*member_id\s*\)/.test(schemaVotes)
    && /UNIQUE\s*\(\s*request_id\s*,\s*user_id\s*\)/.test(schemaVotes)
    && /UNIQUE\s*\(\s*vote_id\s*,\s*voter_member_id\s*\)/.test(schemaVotes),
    'one vote per member per decision');
  for (const routeFile of ['memberCaseRoutes.js', 'officeVoteRoutes.js', 'joinRequestRoutes.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', routeFile), 'utf8');
    assert.ok(!src.includes('.delete('), `${routeFile} must offer no way to delete a vote`);
  }

  // ---- the join-request workflow, exactly as the group runs it -----------
  assert.ok(/ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS occupation/.test(schemaVotes),
    'the applicant must be able to give her occupation');
  assert.ok(joinCtrl.includes('occupation'), 'the occupation must be stored with the request');
  assert.ok(joinCtrl.includes("'APPROVE_JOIN_REQUEST'") && joinCtrl.includes("'REJECT_JOIN_REQUEST'"),
    'the chairperson decision must be recorded in the audit trail');
  assert.ok(joinCtrl.includes('ON CONFLICT (request_id, user_id)'),
    'a member may only change her own ballot, never another person\'s');
  const joinRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'joinRequestRoutes.js'), 'utf8');
  assert.ok(!joinRoutes.includes('.put('), 'there is no way to rewrite a vote over HTTP');
  assert.ok(joinPage.includes('requests.votingOpen'), 'the card must show the voting status');
  assert.ok(joinPage.includes('r.occupation'), 'the occupation sits on the card line');
  assert.ok(joinPage.includes('requests.acceptVotes') && joinPage.includes('requests.rejectVotes'),
    'the accept and reject counts must both be shown');
  assert.ok(joinPage.includes('requests.accept') && joinPage.includes('requests.decline'),
    'the chairperson approves or rejects from the card');
  const homePage = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Home.jsx'), 'utf8');
  assert.ok(homePage.includes("change('occupation')"), 'the public join form must collect the occupation');

  // ---- the chairperson keeps the records, she never hands out standing -----
  assert.ok(!/role\s*=\s*COALESCE/.test(userCtrl), 'the office edit screen must never write a role');
  assert.ok(userCtrl.includes('Roles are given by a vote of the members'),
    'a role change from the office screen must be refused');
  assert.ok(userCtrl.includes("const role = 'member'"),
    'everyone added from the office screen joins as an ordinary member');
  assert.ok(!membersPage.includes('e-role') && !membersPage.includes('m-role') && !membersPage.includes('form.role'),
    'the member forms must not offer a role to pick');
  assert.ok(membersPage.includes('members.repaidOf') && membersPage.includes('members.welfarePaid'),
    'the member record must show her repayments and her welfare contributions');

  // ---- the chairperson watches loans without inventing new approval paths ----
  const loansPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Loans.jsx'), 'utf8');
  assert.ok(loansPage.includes('outstanding') && loansPage.includes('due_date'),
    'the loans page must show balances and overdue status');
  assert.ok(loansPage.includes('repayments') && loansPage.includes('canDecide'),
    'the chairperson sees repayments and any existing approval controls');
  assert.ok(loansPage.includes('status === \'approved\''), 'the loan status is shown clearly');
  // Approval stays with the authorised committee; we do not invent new workflow.

  // ---- the savings book: watched, never quietly rewritten -----------------
  assert.ok(can('admin', 'savings.view'), 'the chairperson may open the savings book');
  assert.ok(!can('admin', 'savings.record'), 'the chairperson does not add or correct entries');
  const chairView = await run(requirePermission('savings.view'), { role: 'admin' });
  assert.strictEqual(chairView.passed, true);
  const chairRecord = await run(requirePermission('savings.record'), { role: 'admin' });
  assert.strictEqual(chairRecord.status, 403);
  const savingsRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'savingsRoutes.js'), 'utf8');
  assert.ok(savingsRoutes.includes("router.get('/', requirePermission('savings.view')"),
    'reading the book needs only the view permission');
  assert.ok(savingsRoutes.includes("router.post('/', requirePermission('savings.record')"),
    'adding an entry needs the record permission');
  assert.ok(savingsRoutes.includes("router.patch('/:id', requirePermission('savings.record')"),
    'correcting an entry needs the record permission');
  assert.ok(savingsRoutes.includes("router.delete('/:id', requirePermission('savings.delete')"),
    'removing an entry is its own explicit permission');
  // Any correction that does happen is controlled and audited.
  const savingsCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'savingsController.js'), 'utf8');
  assert.ok(savingsCtrl.includes("audit(req.user.id, 'UPDATE_SAVING'"),
    'a corrected entry must write the old and new figures to the audit trail');
  assert.ok(savingsCtrl.includes("audit(req.user.id, 'DELETE_SAVING'"),
    'a removed entry must write who took it out to the audit trail');
  // The page itself only offers recording to the treasurers and secretary.
  const savingsPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Savings.jsx'), 'utf8');
  assert.ok(savingsPage.includes('isRecorder && <button') || savingsPage.includes('action={isRecorder &&'),
    'the record button is for the recorders only');
  assert.ok(savingsPage.includes('{isRecorder && (') && savingsPage.includes("t('common.edit')"),
    'the chairperson cannot open an entry for editing');
  assert.ok(savingsPage.includes('{isAdmin && (') && savingsPage.includes("t('common.del')"),
    'removing an entry stays an explicit, authorised action');

  // The administrator's own pages stay out of the chairperson's routes.
  assert.ok(routeLine('admin/users').includes('system_admin') && !routeLine('admin/users').includes("'admin'"),
    'the chairperson cannot open the user management page');
  assert.ok(routeLine('admin/roles').includes('system_admin') && !routeLine('admin/roles').includes("'admin'"),
    'the chairperson cannot open the roles page');

  // Her sidebar is the leadership menu: membership, money, group, reports,
  // activity, profile — and never one of the administrator's pages.
  const navSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'navItems.js'), 'utf8');
  const chairLines = navSrc.split('\n').filter((l) => l.includes("roles: ['admin']"));
  assert.ok(chairLines.length >= 20, `the chairperson must keep her leadership menu (found ${chairLines.length})`);
  for (const line of chairLines) {
    assert.ok(!line.includes('/app/admin/'), `the chairperson menu must not offer the administrator's page: ${line.trim()}`);
    assert.ok(!line.includes('/app/messages'), 'the chairperson menu follows the leadership layout');
  }
  const chairTargets = chairLines.join('\n');
  for (const page of ['/app/members', '/app/requests', '/app/cases', '/app/leadership', '/app/cycles',
                      '/app/savings', '/app/loans', '/app/fines', '/app/welfare', '/app/shareout',
                      '/app/meetings', '/app/approvals', '/app/analytics', '/app/activity', '/app/profile']) {
    assert.ok(chairTargets.includes(`to: '${page}`), `the chairperson menu must include ${page}`);
  }

  // ---- reset rules --------------------------------------------------------
  assert.strictEqual(resetAttempt({ attempts: 0, maxTries: 3, expired: false }).ok, true);
  assert.deepStrictEqual(resetAttempt({ attempts: 2, maxTries: 3, expired: false }).remaining, 1);
  assert.strictEqual(resetAttempt({ attempts: 3, maxTries: 3, expired: false }).reason, 'too_many');
  assert.strictEqual(resetAttempt({ attempts: 0, maxTries: 3, expired: true }).reason, 'expired');

  // ---- the audit log rejects edits ----------------------------------------
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.ok(schema.includes('prevent_audit_change'), 'the audit guard function must exist');
  assert.ok(schema.includes("RAISE EXCEPTION 'audit_logs is append-only'"), 'the guard must raise on change');
  assert.ok(/BEFORE UPDATE OR DELETE ON audit_logs/.test(schema), 'the trigger must cover update and delete');
  assert.ok(schema.includes('CREATE TRIGGER audit_append_only'), 'the trigger must be installed');

  // The audit routes must offer reads only: no way to change the trail over HTTP.
  const auditRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auditRoutes.js'), 'utf8');
  assert.ok(!/router\.(post|put|patch|delete)\s*\(/.test(auditRoutes), 'the audit routes must not write');

  console.log('admin rules OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
