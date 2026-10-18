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
