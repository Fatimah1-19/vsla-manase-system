const { query } = require('../config/db');

/**
 * Write to the audit trail. Never throws — logging must not break an action.
 *
 * The first five arguments are the original call signature. An optional sixth
 * argument records a before/after pair, so the history stays structured rather
 * than cramming the two values into the free-text details:
 *   audit(userId, action, entityType, entityId, details, { previous, next })
 */
async function audit(userId, action, entityType, entityId, details, values) {
  const previous = values && values.previous != null ? String(values.previous) : null;
  const next = values && values.next != null ? String(values.next) : null;
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, previous_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId || null, action, entityType || null, entityId || null, details || null, previous, next]
    );
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}

module.exports = { audit };
