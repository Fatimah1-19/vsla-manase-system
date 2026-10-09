const { EventEmitter } = require('events');

/**
 * The one bus every domain event travels on.
 *
 * Controllers describe *what happened* ("a saving was recorded") and the
 * listeners in events/listeners.js decide what to do about it (text the
 * member, write the audit trail, raise an absence fine). The controller no
 * longer has to know who cares.
 */
const bus = new EventEmitter();
bus.setMaxListeners(50);

/** The names, kept in one place so a typo cannot silently drop an event. */
const EVENTS = Object.freeze({
  SAVING_RECORDED: 'saving.recorded',
  LOAN_APPLIED: 'loan.applied',
  LOAN_DECIDED: 'loan.decided',
  LOAN_REPAYMENT: 'loan.repayment',
  FINE_RECORDED: 'fine.recorded',
  WELFARE_CONTRIBUTION: 'welfare.contribution',
  WELFARE_PAYOUT: 'welfare.payout',
  MEETING_SCHEDULED: 'meeting.scheduled',
  ATTENDANCE_SAVED: 'attendance.saved',
});

/** Register a listener. Returns a function that removes it again. */
function on(name, listener) {
  bus.on(name, listener);
  return () => bus.off(name, listener);
}

/**
 * Fire an event and wait for the listeners, in the order they were added.
 *
 * Each listener may return a value or a promise; every result is collected, so
 * a caller that needs one (an SMS result, say) can read it from the returned
 * array. A listener that throws is logged and skipped — one broken listener
 * must never roll back money that was actually handed over at the meeting.
 */
async function emit(name, payload = {}) {
  const results = [];
  for (const listener of bus.listeners(name)) {
    try {
      results.push(await listener(payload));
    } catch (err) {
      console.error(`[events] listener for "${name}" failed: ${err.message}`);
      results.push(undefined);
    }
  }
  return results;
}

/** How many listeners an event has. Handy for tests. */
const listenerCount = (name) => bus.listenerCount(name);

module.exports = { EVENTS, on, emit, listenerCount, bus };
