/**
 * ACCEPTANCE TEST - the ordinary member's dashboard and private records.
 *
 * A member may see a small, sanitised group timeline (meetings, cycles and
 * share-out notices) and her own money. She may never read the audit trail,
 * another member's savings, or the group's pooled financial positions. This
 * test reads the files that ship. No database.
 *
 * Run with: node test/member-dashboard.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { PERMISSIONS, can } = require('../config/permissions.js');

const root = path.join(__dirname, '..', '..');
const back = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const front = (rel) => fs.readFileSync(path.join(root, 'frontend', 'src', rel), 'utf8');

const auditRoutes = back(path.join('routes', 'auditRoutes.js'));
const auditCtrl = back(path.join('controllers', 'auditController.js'));
const dashboardCtrl = back(path.join('controllers', 'dashboardController.js'));
const profileCtrl = back(path.join('controllers', 'profileController.js'));
const savingsCtrl = back(path.join('controllers', 'savingsController.js'));
const appJsx = front('App.jsx');
const activityJsx = front('pages/Activity.jsx');
const savingsJsx = front('pages/Savings.jsx');
const memberDash = front('pages/dashboards/MemberDashboard.jsx');

/** The text between two markers, so a rule can be checked in one branch only. */
function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing end marker: ${end}`);
  return source.slice(from, to);
}

let done = 0;
function check(n, title, fn) {
  fn();
  done += 1;
  console.log(`  ${String(n).padStart(2, ' ')}. ${title}`);
}

console.log('ACCEPTANCE TEST - member dashboard privacy and correctness');

check(1, 'the full audit trail stays with the system administrator', () => {
  assert.deepStrictEqual(PERMISSIONS['audit.view'], ['system_admin']);
  assert.strictEqual(can('system_admin', 'audit.view'), true);
  for (const role of ['admin', 'treasurer', 'secretary', 'member']) {
    assert.strictEqual(can(role, 'audit.view'), false, `${role} must not read the audit trail`);
  }
});

check(2, 'the group timeline is protected but not gated by audit.view', () => {
  const route = "router.get('/group', protect, c.groupActivity);";
  const guard = 'router.use(protect, requirePermission(\'audit.view\'));';
  assert.ok(auditRoutes.includes(route), 'the member timeline route must exist');
  assert.ok(auditRoutes.includes(guard), 'the audit guard must exist');
  assert.ok(auditRoutes.indexOf(route) < auditRoutes.indexOf(guard),
    'the group route must be registered before the audit guard');
  assert.ok(!route.includes('requirePermission'), 'the group route must not require audit.view');
});

check(3, 'the full audit endpoints remain behind the audit guard', () => {
  const guard = 'router.use(protect, requirePermission(\'audit.view\'));';
  const after = auditRoutes.slice(auditRoutes.indexOf(guard) + guard.length);
  for (const call of ["router.get('/', c.listAudit)", "router.get('/export', c.exportAudit)",
    "router.get('/sessions', c.listSessions)"]) {
    assert.ok(after.includes(call), `${call} must come after the guard`);
  }
});

check(4, 'the group timeline selects only harmless columns', () => {
  const fn = between(auditCtrl, 'const groupActivity', 'module.exports');
  assert.ok(/SELECT id, action, details, created_at/.test(fn), 'only the four group columns are read');
  for (const leak of ['user_id', 'full_name', 'entity_type', 'entity_id', 'previous_value', 'new_value']) {
    assert.ok(!new RegExp(`\\b${leak}\\b`).test(fn), `the group timeline must not expose ${leak}`);
  }
  assert.ok(/action = ANY\(\$1\)/.test(fn), 'only whitelisted actions are returned');
  assert.ok(/LIMIT 60/.test(fn), 'the timeline is capped');
});

check(5, 'the member dashboard reads only her own member record', () => {
  const member = between(dashboardCtrl, "if (role === 'member')", '// ---------- System administrator');
  assert.ok(member.includes('const memberId = req.user.member_id'), 'the member id comes from the token');
  assert.ok(!/req\.(query|params|body)/.test(member),
    'the member cannot choose another member id from the request');
  assert.ok(member.includes('WHERE member_id = $1'), 'her rows are filtered by her own member id');
});

check(6, 'the member dashboard shows no group-wide money figures', () => {
  const member = between(dashboardCtrl, "if (role === 'member')", '// ---------- System administrator');
  for (const leak of ['groupMoney', 'groupLoans', 'groupCash', 'recent_contributions', 'groupOutstanding']) {
    assert.ok(!member.includes(leak), `the member payload must not contain ${leak}`);
  }
});

check(7, 'member dashboard savings totals count verified entries only', () => {
  const member = between(dashboardCtrl, "if (role === 'member')", '// ---------- System administrator');
  assert.ok(/SUM\(amount\) FILTER \(WHERE status='verified'\)/.test(member),
    'the savings total counts verified money only');
  assert.ok(/SUM\(shares\) FILTER \(WHERE status='verified'\)/.test(member),
    'shares count verified money only');
  assert.ok(/status='pending_verification'/.test(member), 'pending money is reported separately');
  assert.ok(/SELECT id, amount::float, shares, note, date FROM savings\s+WHERE member_id = \$1 AND status='verified'/.test(member),
    'the recent-entries card shows verified savings only');
});

check(8, 'profile/me is scoped to the signed-in member and verifies totals', () => {
  const fn = between(profileCtrl, 'const getMyProfile', 'const updateMyProfile =');
  assert.ok(fn.includes('const memberId = req.user.member_id'), 'the member id comes from the token');
  assert.ok(!/req\.(query|params|body)/.test(fn), 'profile/me takes no member id from the request');
  assert.ok(/FROM savings WHERE member_id = \$1 AND status = 'verified'/.test(fn),
    'profile totals count verified savings only');
  assert.ok(/FROM savings WHERE member_id = \$1/.test(fn), 'savings rows are her own only');
});

check(9, 'the member savings page uses her profile, not the committee books', () => {
  const branch = between(savingsJsx, 'if (!isCommittee) {', 'const [list, sum, mem]');
  assert.ok(branch.includes("api.get('/profile/me')"), 'the member branch reads profile/me');
  assert.ok(!branch.includes("api.get('/savings')"), 'the member branch must not read the group savings list');
  assert.ok(!branch.includes("api.get('/savings/summary')"), 'the member branch must not read group totals');
});

check(10, 'a removed saving cannot remain in any balance', () => {
  const fn = between(savingsCtrl, 'const deleteSaving', 'module.exports');
  assert.ok(/DELETE FROM savings WHERE id = \$1/.test(fn), 'a removed saving is really deleted');
});

check(11, 'only a member (and the system administrator) may open /app/activity', () => {
  assert.ok(/path="activity"\s+element=\{<ProtectedRoute roles=\{\['system_admin', 'member'\]\}/.test(appJsx),
    'the activity route is limited to the system administrator and members');
  assert.ok(/user\?\.role === 'member' \? <GroupActivity \/> : <AdminActivity \/>/.test(activityJsx),
    'a member is shown the group timeline, never the audit trail');
});

check(12, 'the member quick actions reach all seven personal pages', () => {
  const actions = between(memberDash, 'const quickActions = [', '];');
  const wanted = ['/app/savings', '/app/loans', '/app/welfare', '/app/wrappers',
    '/app/fines', '/app/shareout', '/app/receipts'];
  for (const to of wanted) {
    assert.ok(actions.includes(`to: '${to}'`), `quick actions must include ${to}`);
  }
  const links = actions.match(/\{ to: '\/app\/[^']+'/g) || [];
  assert.strictEqual(links.length, wanted.length, 'exactly the seven personal destinations are offered');
});

console.log(`\n  ${done} checks passed.\n`);
