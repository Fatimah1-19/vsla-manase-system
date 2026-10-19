/**
 * Every role rule in the whole system lives here, and only here.
 *
 * A controller or a route says what job is being done ("record a saving", "read
 * the audit trail"), never which roles may do it. Changing who may do something
 * means editing this one file, and the tests look at this file alone.
 *
 * Nothing here touches the database, so it can be tested on its own.
 */

// Everyone the system knows. `system_admin` is deliberately not one of the
// group's offices: she looks after accounts, never the books.
const ROLES = ['admin', 'treasurer', 'secretary', 'member', 'system_admin'];

// The offices the members elect.
const OFFICES = ['admin', 'treasurer', 'secretary'];

// The named groups used across the app.
const GROUPS = {
  offices: OFFICES,
  committee: ['admin', 'treasurer', 'secretary'],
  recorders: ['treasurer', 'secretary'],
  members: ['admin', 'treasurer', 'secretary', 'member'],
};

/**
 * Permission -> the roles that hold it.
 * The keys read like the job: "savings.record" is "write a saving in the book".
 */
const PERMISSIONS = {
  // ---- savings ----
  'savings.view': ['admin', 'treasurer', 'secretary'],
  'savings.record': ['treasurer', 'secretary'],
  'savings.delete': ['admin'],

  // ---- loans ----
  'loans.viewAll': ['admin', 'treasurer', 'secretary'],
  'loans.decide': ['admin', 'treasurer'],
  'loans.record': ['treasurer', 'secretary'],

  // ---- fines ----
  'fines.viewAll': ['admin', 'treasurer', 'secretary'],
  'fines.record': ['treasurer', 'secretary'],
  'fines.delete': ['admin'],

  // ---- monthly wrappers (contributions) ----
  'contributions.view': ['admin', 'treasurer', 'secretary'],
  'contributions.record': ['treasurer', 'secretary'],
  'contributions.delete': ['admin'],

  // ---- welfare ----
  'welfare.record': ['treasurer', 'secretary'],

  // ---- registration fees ----
  'registration.view': ['admin', 'treasurer', 'secretary'],
  'registration.record': ['treasurer', 'secretary'],
  'registration.delete': ['admin'],

  // ---- share-out ----
  'shareout.view': ['admin', 'treasurer', 'secretary'],
  'shareout.record': ['treasurer', 'secretary'],

  // ---- reports and analytics ----
  'reports.view': ['admin', 'treasurer', 'secretary'],
  'analytics.view': ['admin', 'treasurer', 'secretary'],

  // ---- cycles ----
  'cycles.manage': ['admin'],

  // ---- meetings ----
  'meetings.record': ['treasurer', 'secretary'],

  // ---- text messages ----
  'messages.view': ['admin', 'treasurer', 'secretary'],
  'messages.send': ['admin', 'treasurer', 'secretary'],

  // ---- people and offices ----
  'users.view': ['admin', 'secretary', 'treasurer'],
  'users.manage': ['admin'],
  'approvals.view': ['admin', 'treasurer'],
  'approvals.decide': ['admin', 'treasurer'],
  // The rules the group lives by: the administrator keeps every one of them now.
  'groupRules.view': ['admin', 'treasurer', 'system_admin'],
  'groupRules.propose': ['admin', 'system_admin'],
  'joinRequests.decide': ['admin', 'treasurer'],
  'cases.manage': ['admin'],
  'cases.settlement': ['treasurer', 'secretary'],
  'officeVotes.manage': ['admin', 'treasurer', 'secretary'],

  // ---- the system administrator (accounts and the system itself) ----
  'accounts.view': ['system_admin'],
  'accounts.manage': ['system_admin'],
  'system.settings': ['system_admin'],

  // ---- the record of everything ----
  'audit.view': ['admin', 'secretary', 'treasurer', 'system_admin'],
};

/**
 * Everything that has to do with the group's money. The system administrator is
 * deliberately absent from every one of these, so wherever money is handled she
 * is refused with 403. The tests check that this list stays money-only.
 */
const MONEY_PERMISSIONS = [
  'savings.view', 'savings.record', 'savings.delete',
  'loans.viewAll', 'loans.decide', 'loans.record',
  'fines.viewAll', 'fines.record', 'fines.delete',
  'contributions.view', 'contributions.record', 'contributions.delete',
  'welfare.record',
  'registration.view', 'registration.record', 'registration.delete',
  'shareout.view', 'shareout.record',
  'reports.view', 'analytics.view', 'cycles.manage',
  'messages.view', 'messages.send', 'meetings.record',
];

// ---- the pure rules -------------------------------------------------------

/** Does this role hold this permission? */
function can(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
}

/** Does this role hold any of these permissions? */
function canAny(role, permissions) {
  return permissions.some((p) => can(role, p));
}

/** The system administrator is the one role that is not a group office. */
function isSystemAdmin(role) {
  return role === 'system_admin';
}

/** True if the role holds even one permission that touches money. */
function touchesMoney(role) {
  return canAny(role, MONEY_PERMISSIONS);
}

/** The roles that hold a permission, for menus and tests. */
function rolesFor(permission) {
  return [...(PERMISSIONS[permission] || [])];
}

// ---- the express guards ---------------------------------------------------
// Only the "who may do this" part lives here. Logging in stays in middleware/auth.

const deny = (res, message) => res.status(403).json({ message });

/** Allow only the given roles. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue.' });
    if (!roles.includes(req.user.role)) return deny(res, 'Your role cannot do this.');
    next();
  };
}

/** Allow only roles that hold this permission. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue.' });
    if (!can(req.user.role, permission)) return deny(res, 'Your role cannot do this.');
    next();
  };
}

// Named groups, kept for the routes that talk about an office rather than a job.
const committee = () => authorize(...GROUPS.committee);
const recorders = () => authorize(...GROUPS.recorders);
const systemAdmin = () => authorize('system_admin');

/** Refuse the system administrator on any route that handles money. */
function blockSystemAdmin(req, res, next) {
  if (req.user && isSystemAdmin(req.user.role)) {
    return deny(res, 'Administrators cannot open money records.');
  }
  next();
}

module.exports = {
  ROLES, OFFICES, GROUPS, PERMISSIONS, MONEY_PERMISSIONS,
  can, canAny, isSystemAdmin, touchesMoney, rolesFor,
  authorize, requirePermission, committee, recorders, systemAdmin, blockSystemAdmin,
};
