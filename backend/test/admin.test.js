const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ROLES, PERMISSIONS, MONEY_PERMISSIONS, can, touchesMoney, requirePermission, blockSystemAdmin,
} = require('../config/permissions.js');
const { canDecideChange, canRemoveAdministrator, canSetSystemRole, resetAttempt } = require('../utils/adminRules.js');

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
