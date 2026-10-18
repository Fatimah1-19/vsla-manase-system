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

  // ---- the fines book: watched in full, changed only in the open ----------
  assert.ok(can('admin', 'fines.viewAll'), 'the chairperson may see every fine');
  assert.ok(!can('admin', 'fines.record'), 'the chairperson does not record or settle fines');
  const chairFinesView = await run(requirePermission('fines.viewAll'), { role: 'admin' });
  assert.strictEqual(chairFinesView.passed, true);
  const chairFinesRecord = await run(requirePermission('fines.record'), { role: 'admin' });
  assert.strictEqual(chairFinesRecord.status, 403);
  const fineRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'fineRoutes.js'), 'utf8');
  assert.ok(fineRoutes.includes("router.get('/', c.listFines)"),
    'the fine history reads openly within the group');
  assert.ok(fineRoutes.includes("router.post('/', requirePermission('fines.record')"),
    'recording a fine needs the record permission');
  assert.ok(fineRoutes.includes("router.patch('/:id/pay', requirePermission('fines.record')"),
    'settling a fine needs the record permission');
  assert.ok(fineRoutes.includes("router.delete('/:id', requirePermission('fines.delete')"),
    'removing a fine is its own explicit permission');
  const fineCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'fineController.js'), 'utf8');
  assert.ok(fineCtrl.includes("req.user.role === 'member'"), 'a member only ever sees her own fines');
  assert.ok(fineCtrl.includes('unpaid -> paid') && fineCtrl.includes('reason: payment received'),
    'marking paid must record the previous value, the new value and the reason');
  assert.ok(fineCtrl.includes("audit(req.user.id, 'DELETE_FINE'") && /reason: \$\{reason/.test(fineCtrl),
    'a removed fine must record who, what, the old figures and the reason');
  const finesPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Fines.jsx'), 'utf8');
  assert.ok(finesPage.includes("key: 'reason'"), 'the fine type is on the page');
  assert.ok(finesPage.includes('outstanding') && finesPage.includes('collected') && finesPage.includes('rows.length'),
    'recorded, paid and outstanding fines must all be shown');
  assert.ok(finesPage.includes(': isRecorder'), 'only a recorder can settle a fine');
  assert.ok(finesPage.includes('isAdmin ? ['), 'only the chairperson sees the remove button');
  assert.ok(finesPage.includes('removeReason') && finesPage.includes('{ reason: removeReason.trim() }'),
    'a removal must carry a written reason into the audit trail');
  assert.ok(finesPage.includes("t('fines.removeTitle')"),
    'the removal asks for the reason in its own dialog');

  // ---- the welfare fund: watched in full, the arithmetic stays put --------
  assert.ok(can('admin', 'welfare.record') === false, 'the chairperson does not move welfare money');
  const chairWelfareRecord = await run(requirePermission('welfare.record'), { role: 'admin' });
  assert.strictEqual(chairWelfareRecord.status, 403);
  const welfareRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'welfareRoutes.js'), 'utf8');
  assert.ok(welfareRoutes.includes("router.get('/balance', c.getBalance)"),
    'the total fund is there for the chairperson to read');
  assert.ok(welfareRoutes.includes("router.get('/', c.listWelfare)"),
    'the transaction history reads openly within the group');
  assert.ok(welfareRoutes.includes("router.post('/contribution', requirePermission('welfare.record')"),
    'recording a contribution needs the record permission');
  assert.ok(welfareRoutes.includes("router.post('/payout', requirePermission('welfare.record')"),
    'recording a payment needs the record permission');
  assert.ok(!/router\.(patch|delete|put)\s*\(/.test(welfareRoutes),
    'nothing in the welfare book can be edited or removed over HTTP');
  const welfareCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'welfareController.js'), 'utf8');
  assert.ok(welfareCtrl.includes('BALANCE_SQL') && welfareCtrl.includes("type='contribution'"),
    'the welfare calculation logic is left exactly as it was');
  const welfarePage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Welfare.jsx'), 'utf8');
  for (const card of ['welfare.balance', 'welfare.contribution', 'welfare.payout']) {
    assert.ok(welfarePage.includes(card), `the welfare page must show the ${card} figure`);
  }
  assert.ok(welfarePage.includes("key: 'full_name'") && welfarePage.includes("key: 'type'"),
    'contributions are listed per member with their status');
  assert.ok(welfarePage.includes('action={isRecorder &&'), 'the chairperson sees no way to record');

  // ---- share-out: monitored, confirmed by the chair, calculated by the system
  assert.ok(can('admin', 'shareout.view'), 'the chairperson may watch the share-out');
  assert.ok(can('admin', 'shareout.record') === false, 'the chairperson does not run the share-out');
  const chairShareView = await run(requirePermission('shareout.view'), { role: 'admin' });
  assert.strictEqual(chairShareView.passed, true);
  const chairShareRecord = await run(requirePermission('shareout.record'), { role: 'admin' });
  assert.strictEqual(chairShareRecord.status, 403);
  const shareRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shareOutRoutes.js'), 'utf8');
  assert.ok(shareRoutes.includes("router.get('/preview', requirePermission('shareout.view')"),
    'the share-out calculations are there to look at');
  assert.ok(shareRoutes.includes("router.get('/', requirePermission('shareout.view')"),
    'the share-out history is there to look at');
  assert.ok(shareRoutes.includes("router.post('/', requirePermission('shareout.record')"),
    'creating a share-out needs the record permission');
  assert.ok(shareRoutes.includes("router.post('/:id/confirm', requirePermission('shareout.view')"),
    'the existing confirmation step stays with anyone who may view');
  assert.ok(shareRoutes.includes("router.post('/:id/distribute', requirePermission('shareout.record')"),
    'handing out the money needs the record permission');
  assert.ok(!/router\.(patch|delete|put)\s*\(/.test(shareRoutes),
    'a share-out cannot be edited or removed over HTTP');
  const shareCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'shareOutController.js'), 'utf8');
  assert.ok(shareCtrl.includes('computeShareOut') && shareCtrl.includes('module.exports'),
    'the one calculation method is the one the system already had');
  assert.ok(shareCtrl.includes("'CONFIRM_SHAREOUT'"), 'the chairperson confirmation is recorded');
  const sharePage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'ShareOut.jsx'), 'utf8');
  assert.ok(sharePage.includes("api.get('/shareout/preview')") && sharePage.includes('shareout__breakdown'),
    'the committee view shows the calculations and the current cycle');
  assert.ok(sharePage.includes('preview?.shares') && sharePage.includes('shareout.perMember'),
    'member share-out information is listed');
  assert.ok(sharePage.includes('shareout.interestBack') && sharePage.includes('shareout.interestReturned'),
    'the interest and profit distribution is shown');
  assert.ok(sharePage.includes('shareout__historyList'), 'the share-out history is shown');
  assert.ok(sharePage.includes("t('shareout.confirmFigures')"),
    'the existing confirm step is offered to the chairperson');
  assert.ok(sharePage.includes('canRun && !draft && preview') && sharePage.includes('canRun && ('),
    'calculating and distributing stay with the recorders');
  assert.ok(shareCtrl.includes("status = 'confirmed'") || shareCtrl.includes("'confirmed'"),
    'the share-out keeps its draft, confirmed and distributed statuses');

  // ---- meetings: the schedule, the records and the attendance -------------
  const meetingRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meetingRoutes.js'), 'utf8');
  assert.ok(meetingRoutes.includes("router.get('/', c.listMeetings)")
    && meetingRoutes.includes("router.get('/:id', c.getMeeting)"),
    'the schedule and the meeting records read openly within the group');
  assert.ok(meetingRoutes.includes("router.post('/', requirePermission('meetings.record')"),
    'scheduling a meeting needs the record permission');
  assert.ok(meetingRoutes.includes("router.patch('/:id', requirePermission('meetings.record')"),
    'writing the minutes needs the record permission');
  assert.ok(meetingRoutes.includes("router.put('/:id/attendance', requirePermission('meetings.record')"),
    'saving attendance needs the record permission');
  assert.ok(!can('admin', 'meetings.record'), 'the chairperson does not run the meeting records');
  const chairMeetings = await run(requirePermission('meetings.record'), { role: 'admin' });
  assert.strictEqual(chairMeetings.status, 403);
  const meetingsPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Meetings.jsx'), 'utf8');
  assert.ok(meetingsPage.includes('is-upcoming'), 'upcoming meetings are marked as such');
  assert.ok(meetingsPage.includes("t('meetings.statusUpcoming')") && meetingsPage.includes("t('meetings.statusHeld')"),
    'every meeting shows its status');
  assert.ok(meetingsPage.includes('presentCount') && meetingsPage.includes('meetings__minutes'),
    'attendance and the meeting records are both on the page');
  assert.ok(meetingsPage.includes("t('meetings.viewRecord')") && meetingsPage.includes('disabled={!isRecorder}'),
    'the chairperson opens the record read-only');
  assert.ok(!meetingsPage.includes('/settings'),
    'the meetings page carries no system configuration');

  // ---- VSLA settings approval: the chairperson's own section --------------
  assert.ok(can('admin', 'approvals.view') && can('admin', 'approvals.decide'),
    'the chairperson both sees and decides what is waiting');
  const chairApprove = await run(requirePermission('approvals.decide'), { role: 'admin' });
  assert.strictEqual(chairApprove.passed, true);
  const approvalRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'approvalRoutes.js'), 'utf8');
  assert.ok(approvalRoutes.includes("router.get('/', requirePermission('approvals.view')"),
    'the waiting list needs the view permission');
  assert.ok(approvalRoutes.includes("router.post('/:id/decide', requirePermission('approvals.decide')"),
    'confirming needs the decide permission');
  assert.ok(!/router\.(put|patch|delete)\s*\(/.test(approvalRoutes),
    'a request is only ever decided, never edited');
  assert.ok(adminCtrl.includes('cr.approver_role'), 'each request says whose confirmation it waits for');
  assert.ok(adminCtrl.includes('You cannot confirm your own request.'),
    'nobody confirms their own request');
  assert.ok(adminCtrl.includes('already decided') && adminCtrl.includes('not yours to confirm'),
    'a decided or foreign request must be refused');
  const approvalsPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Approvals.jsx'), 'utf8');
  assert.ok(approvalsPage.includes("t('nav.settingsApproval')"),
    'the section is titled VSLA Settings Approval');
  assert.ok(approvalsPage.includes("admin.pendingChair"),
    'a pending request says it awaits the chairperson confirmation');
  assert.ok(approvalsPage.includes("admin.currentValue") && approvalsPage.includes("admin.proposedValue"),
    'every setting shows the current and the proposed value');
  assert.ok(approvalsPage.includes('SECTION_KEYS') && approvalsPage.includes('CATEGORY_ORDER')
    && approvalsPage.includes('GROUP_LABELS'),
    'the proposed settings are grouped under their category with real names');
  assert.ok(approvalsPage.includes("admin.requestedBy") && approvalsPage.includes('shortDate(r.created_at)'),
    'the request shows who proposed it and when');
  assert.ok(approvalsPage.includes("t('admin.approve')") && approvalsPage.includes("t('admin.reject')"),
    'the actions are Confirm and Reject');
  assert.ok(approvalsPage.includes("'/settings/group-rules'"),
    'the current value comes from the live group rules');
  const ruleLabels = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'groupRuleLabels.js'), 'utf8');
  for (const cat of ['savings', 'loans', 'fines', 'welfare', 'shareout', 'membership', 'voting', 'meetings']) {
    assert.ok(ruleLabels.includes(`'${cat}'`), `the approval categories must include ${cat}`);
  }

  // ---- the important-setting approval rule --------------------------------
  const applyCall = 'await applyGroupRules(payload, req.user.id)';
  const rejectReturn = "return res.json({ message: 'Request rejected.' })";
  assert.ok(adminCtrl.includes(applyCall), 'a confirmed setting request applies the new rules');
  assert.ok(adminCtrl.indexOf(rejectReturn) !== -1
    && adminCtrl.indexOf(rejectReturn) < adminCtrl.indexOf(applyCall),
    'a rejected request returns before anything is applied, so the old value stands');
  assert.ok(adminCtrl.indexOf(applyCall) < adminCtrl.indexOf("SET status = 'approved'"),
    'the new rules are applied before the request is marked in force');
  assert.ok(adminCtrl.includes("audit(req.user.id, 'REJECT_CHANGE_REQUEST'")
    && adminCtrl.includes("audit(req.user.id, 'APPROVE_CHANGE_REQUEST'"),
    'both decisions are written to the audit log');
  const settingsRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'settingsRoutes.js'), 'utf8');
  assert.ok(settingsRoutes.includes("router.put('/system', requirePermission('system.settings')"),
    'the technical system settings stay behind their own permission');
  assert.ok(routeLine('admin/settings/:section').includes('system_admin')
    && !routeLine('admin/settings/:section').includes("'admin'"),
    'the chairperson cannot open the technical settings page');

  // ---- reports: viewed, filtered and printed, never written --------------
  const reportRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'reportRoutes.js'), 'utf8');
  assert.ok(reportRoutes.includes("requirePermission('reports.view')")
    && !/router\.(post|put|patch|delete)\s*\(/.test(reportRoutes),
    'the reports read saved records and never write them');
  assert.ok(can('admin', 'reports.view') && can('treasurer', 'reports.view')
    && can('secretary', 'reports.view'),
    'the whole committee can open the reports');
  const reportsPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Reports.jsx'), 'utf8');
  for (const key of ['reportSavings', 'reportRepayments', 'reportWelfare', 'reportShareout',
                     'reportStatus', 'reportRequests']) {
    assert.ok(reportsPage.includes(`'${key}'`), `the reports must offer ${key}`);
  }
  assert.ok(reportsPage.includes('window.print()') && reportsPage.includes("t('reports.print')")
    && reportsPage.includes("t('reports.reportExport')"),
    'a report can be printed and exported');
  assert.ok(reportsPage.includes("q.set('memberId'"),
    'the register can be filtered down to one member');
  assert.ok(reportsPage.includes('groupOnlyNote') && reportsPage.includes('/members?all=true')
    && reportsPage.includes("'/shareout'") && reportsPage.includes("'/requests'"),
    'the group-only reports bring their own data');
  assert.ok(reportsPage.includes("t('members.active')") && reportsPage.includes("t('members.inactive')"),
    'membership status uses the real member labels');
  assert.ok(reportsPage.includes("t('requests.votingOpen')") && reportsPage.includes("t('requests.acceptVotes')"),
    'join requests show the group decision and its votes');
  assert.ok(reportsPage.includes('shareout.confirmedTag') && reportsPage.includes('total_fund'),
    'the share-out history shows each cycle with its fund');
  assert.ok(reportsPage.includes("t('reports.repaid')"),
    'the repayment reports show what was paid back');
  assert.ok(routeLine('analytics').includes('COMMITTEE')
    && routeLine('reports').includes('analytics?tab=reports'),
    'the reports live behind the committee route and redirect to their tab');

  // ---- group activity: the group's doings, in her own log -----------------
  const meetingCtrl = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'meetingController.js'), 'utf8');
  const listeners = fs.readFileSync(
    path.join(__dirname, '..', 'events', 'listeners.js'), 'utf8');
  for (const [what, src, action] of [
    ['a new join request', joinCtrl, "'SUBMIT_JOIN_REQUEST'"],
    ['a join-request vote', joinCtrl, "'VOTE_JOIN_REQUEST'"],
    ['an approved request', joinCtrl, "'APPROVE_JOIN_REQUEST'"],
    ['a rejected request', joinCtrl, "'REJECT_JOIN_REQUEST'"],
    ['a saving', listeners, "'RECORD_SAVING'"],
    ['a loan application', listeners, "'APPLY_LOAN'"],
    ['a loan decision', listeners, "'APPROVE_LOAN'"],
    ['a repayment', listeners, "'RECORD_REPAYMENT'"],
    ['a fine', listeners, "'RECORD_FINE'"],
    ['a welfare movement', listeners, "'WELFARE_CONTRIBUTION'"],
    ['a share-out', shareCtrl, "'CREATE_SHAREOUT'"],
    ['a meeting', meetingCtrl, "'CREATE_MEETING'"],
    ['a confirmed setting', adminCtrl, "'APPROVE_CHANGE_REQUEST'"],
  ]) {
    assert.ok(src.includes(action), `the activity log must carry ${what}`);
  }
  const activityPage = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Activity.jsx'), 'utf8');
  for (const col of ['colUser', 'colAction', 'colDate', 'colTime', 'colStatus']) {
    assert.ok(activityPage.includes(`'activity.${col}'`), `the activity table must show ${col}`);
  }
  assert.ok(activityPage.includes("'activity.readOnly'"),
    'the group activity must say it is read-only');
  assert.ok(!/api\.(post|put|patch|del)\s*\(/.test(activityPage),
    'nothing on the activity page may change what it shows');
  assert.ok(!/const FAILED = .*REJECT/.test(activityPage),
    'a rejection is a decision of the group, not a failed action');

  // ---- audit history: read by the chairperson, changed by nobody ----------
  assert.ok(can('admin', 'audit.view') && can('secretary', 'audit.view')
    && can('treasurer', 'audit.view') && can('system_admin', 'audit.view'),
    'the offices and the administrator may read the history');
  const systemActivity = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'SystemActivity.jsx'), 'utf8');
  assert.ok(!/api\.(post|put|patch|del)\s*\(/.test(systemActivity),
    'the administrator reads the trail too and never rewrites it');
  assert.ok(routeLine('activity').includes('COMMITTEE') && routeLine('activity').includes('system_admin'),
    'the committee and the administrator may open the group activity');
  assert.ok(routeLine('admin/activity').includes('system_admin')
    && !routeLine('admin/activity').includes("'admin'"),
    'the technical audit management stays with the administrator alone');
  for (const file of ['en.extra.js', 'ny.extra.js']) {
    const dict = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'i18n', file), 'utf8');
    for (const key of ['reportSavings', 'reportRepayments', 'reportWelfare', 'reportShareout',
                       'reportStatus', 'reportRequests', 'groupSavingsTitle', 'groupRepaymentsTitle',
                       'groupWelfareTitle', 'groupShareoutTitle', 'groupOnlyNote', 'repaid',
                       'cycleName', 'shareFund', 'decidedBy']) {
      assert.ok(dict.includes(`${key}:`), `${file} must carry ${key}`);
    }
  }

  // ---- access control is enforced by the server, not by the buttons --------
  // The chairperson cannot record money anywhere, whatever a screen offers.
  for (const perm of ['savings.record', 'contributions.record', 'welfare.record', 'fines.record',
                      'registration.record', 'shareout.record', 'loans.record', 'meetings.record']) {
    const refused = await run(requirePermission(perm), { role: 'admin' });
    assert.strictEqual(refused.status, 403, `the chairperson must be refused ${perm} at the server`);
    assert.ok(!can('admin', perm), `the chairperson must not hold ${perm}`);
  }
  // The administrator cannot lead the VSLA: no case, no vote, no office, no
  // membership decision, no meeting record, no money.
  for (const perm of ['cases.manage', 'joinRequests.decide', 'officeVotes.manage',
                      'approvals.decide', 'cycles.manage', 'meetings.record', 'savings.record']) {
    assert.ok(!can('system_admin', perm), `the administrator must not hold ${perm}`);
  }
  // A ballot always belongs to the signed-in member, never to the request body.
  const officeCtrl = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'officeVoteController.js'), 'utf8');
  const caseCtrl = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'memberCaseController.js'), 'utf8');
  for (const [name, src] of [['office votes', officeCtrl], ['member cases', caseCtrl],
                             ['join requests', joinCtrl]]) {
    assert.ok(src.includes('req.user.id') || src.includes('req.user.member_id'),
      `${name} must read the voter from the session`);
    assert.ok(!/req\.body\.(userId|user_id|memberId|member_id)/.test(src),
      `${name} must never take a voter from the request body`);
  }
  // A membership decision follows the group's vote: quorum first, then a yes
  // majority to approve. The chairperson records it, she does not bypass it.
  assert.ok(joinCtrl.includes('quorumNeeded') && joinCtrl.includes('still voting'),
    'a join request cannot be decided before the group has voted');
  assert.ok(/yes <= votes\.no/.test(joinCtrl),
    'an approval cannot override a vote the group did not carry');

  // ---- the five roles, each with its own powers ---------------------------
  assert.ok(can('system_admin', 'accounts.manage') && can('system_admin', 'system.settings'),
    'the administrator keeps the system and the accounts');
  assert.ok(can('admin', 'cases.manage') && can('admin', 'joinRequests.decide')
    && can('admin', 'approvals.decide') && can('admin', 'groupRules.propose')
    && !can('admin', 'accounts.manage'),
    'the chairperson leads the group and confirms the rules, without the system');
  assert.ok(can('treasurer', 'savings.record') && can('treasurer', 'loans.record')
    && can('treasurer', 'welfare.record') && !can('treasurer', 'cases.manage'),
    'the treasurer records the money and does not lead');
  assert.ok(can('secretary', 'meetings.record') && can('secretary', 'savings.record')
    && can('secretary', 'joinRequests.decide') && !can('secretary', 'cases.manage')
    && !can('secretary', 'accounts.view'),
    'the secretary keeps the records and does not lead');
  assert.ok(!can('member', 'savings.record') && !can('member', 'cases.manage')
    && !can('member', 'accounts.view') && !can('member', 'meetings.record'),
    'a member takes part and holds no office power');

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
