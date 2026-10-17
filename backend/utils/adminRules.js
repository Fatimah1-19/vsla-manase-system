/**
 * The small, pure decisions the account and password pages make.
 *
 * They are kept away from the database and the web layer so each rule can be
 * tested on its own. A controller asks these functions, then does the work.
 */

/**
 * May this person confirm (approve or reject) a change request?
 * - the request must still be waiting,
 * - the person must hold the role the request was addressed to,
 * - and nobody may confirm their own request.
 */
function canDecideChange({ status, approverRoleRequired, approverRole, requestedById, approverId }) {
  if (status !== 'pending') return { ok: false, reason: 'already_decided' };
  if (approverRole !== approverRoleRequired) return { ok: false, reason: 'wrong_role' };
  if (requestedById === approverId) return { ok: false, reason: 'own_request' };
  return { ok: true };
}

/**
 * May this account be switched off? The group must always keep one active
 * administrator of each kind: the last one may never be removed.
 */
function canRemoveAdministrator({ targetIsAdmin, activeAdministrators }) {
  if (!targetIsAdmin) return { ok: true };
  return Number(activeAdministrators) <= 1
    ? { ok: false, reason: 'last_admin' }
    : { ok: true };
}

// The posts the members fill by a vote of their own. The administrator may never
// hand one of these out from the account screen.
const OFFICE_ROLES = ['admin', 'treasurer', 'secretary'];

/**
 * May the administrator grant or take away the system-administrator role on an
 * account? Only a plain member may be made an administrator, and the last active
 * administrator may never be turned back into a member. An elected office is
 * never touched from here: it is won by a vote of the members.
 */
function canSetSystemRole({ targetRole, makeAdmin, activeAdministrators }) {
  if (['admin', 'treasurer', 'secretary'].includes(targetRole)) return { ok: false, reason: 'is_office' };
  if (makeAdmin && targetRole === 'system_admin') return { ok: false, reason: 'already_admin' };
  if (!makeAdmin && targetRole !== 'system_admin') return { ok: false, reason: 'not_admin' };
  if (!makeAdmin && Number(activeAdministrators) <= 1) return { ok: false, reason: 'last_admin' };
  return { ok: true };
}

/**
 * May this code be tried against a reset request? A code stops being usable
 * when it has expired or has been tried too many times.
 */
function resetAttempt({ attempts, maxTries, expired }) {
  const used = Number(attempts) || 0;
  const limit = Number(maxTries) || 0;
  if (expired) return { ok: false, reason: 'expired', remaining: 0 };
  if (used >= limit) return { ok: false, reason: 'too_many', remaining: 0 };
  return { ok: true, remaining: Math.max(limit - used, 0) };
}

module.exports = { canDecideChange, canRemoveAdministrator, canSetSystemRole, resetAttempt };
