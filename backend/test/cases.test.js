const assert = require('assert');
const {
  ACTIONS, canOpen, canVote, quorumNeeded, tally, isFinished, closingTime,
} = require('../utils/cases.js');

// ---- canOpen: which cases may be opened about a member ----
assert.deepStrictEqual(ACTIONS, ['suspend', 'dismiss', 'reinstate']);

assert.strictEqual(canOpen({ action: 'suspend', memberStatus: 'active' }).ok, true);
assert.strictEqual(canOpen({ action: 'reinstate', memberStatus: 'dismissed' }).ok, true);

assert.strictEqual(canOpen({ action: 'suspend', memberStatus: 'active', role: 'treasurer' }).ok, false,
  'an office holder is dealt with separately');
assert.strictEqual(canOpen({ action: 'dismiss', memberStatus: 'dismissed' }).ok, false,
  'cannot dismiss someone already dismissed');
assert.strictEqual(canOpen({ action: 'suspend', memberStatus: 'active', hasOpenCase: true }).ok, false,
  'only one open case at a time');
assert.strictEqual(canOpen({ action: 'nonsense', memberStatus: 'active' }).ok, false);

// A turned-down proposal cannot be repeated straight away.
const now = new Date('2026-01-31T00:00:00Z');
const recent = new Date('2026-01-21T00:00:00Z');   // 10 days ago
const old = new Date('2025-12-01T00:00:00Z');      // 61 days ago
assert.strictEqual(canOpen({ action: 'suspend', memberStatus: 'active', lastRejectedAt: recent, now }).ok, false);
assert.strictEqual(canOpen({ action: 'suspend', memberStatus: 'active', lastRejectedAt: old, now }).ok, true);

// ---- canVote ----
assert.strictEqual(canVote({ memberStatus: 'active', memberId: 1, subjectMemberId: 2 }).ok, true);
assert.strictEqual(canVote({ memberStatus: 'active', memberId: 2, subjectMemberId: 2 }).ok, false, 'not on yourself');
assert.strictEqual(canVote({ memberStatus: 'suspended', memberId: 1, subjectMemberId: 2 }).ok, false);
assert.strictEqual(canVote({ memberStatus: 'active', userActive: false, memberId: 1, subjectMemberId: 2 }).ok, false);

// ---- quorum ----
assert.strictEqual(quorumNeeded(0, 50), 0, 'nobody to vote');
assert.strictEqual(quorumNeeded(10, 50), 5);
assert.strictEqual(quorumNeeded(9, 50), 5, 'rounds up');
assert.strictEqual(quorumNeeded(3, 50), 2, 'always at least one');

// ---- tally ----
const base = { eligible: 10, quorumPercent: 50, dismissPercent: 67 };
assert.strictEqual(tally({ action: 'suspend', ...base, yes: 3, no: 2 }).outcome, 'passed');
assert.strictEqual(tally({ action: 'suspend', ...base, yes: 2, no: 3 }).outcome, 'rejected');
assert.strictEqual(tally({ action: 'suspend', ...base, yes: 2, no: 1 }).outcome, 'lapsed',
  'not enough members turned out');
assert.strictEqual(tally({ action: 'suspend', eligible: 0, yes: 0, no: 0 }).outcome, 'lapsed');

assert.strictEqual(tally({ action: 'dismiss', ...base, yes: 7, no: 3 }).outcome, 'passed', '70% reaches 67%');
assert.strictEqual(tally({ action: 'dismiss', ...base, yes: 6, no: 4 }).outcome, 'rejected', '60% is short');
assert.strictEqual(tally({ action: 'dismiss', ...base, yes: 2, no: 1 }).outcome, 'lapsed');

const t = tally({ action: 'suspend', ...base, yes: 4, no: 1 });
assert.strictEqual(t.turnout, 5);
assert.strictEqual(t.quorumNeeded, 5);
assert.strictEqual(t.yesPercent, 80);

// ---- isFinished ----
const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);
assert.strictEqual(isFinished({ eligible: 10, voted: 4, closesAt: future }), false);
assert.strictEqual(isFinished({ eligible: 10, voted: 10, closesAt: future }), true, 'everyone voted');
assert.strictEqual(isFinished({ eligible: 10, voted: 4, closesAt: past }), true, 'time is up');

// ---- closingTime ----
const start = new Date('2026-01-01T00:00:00Z');
assert.strictEqual(closingTime(7, start).toISOString().slice(0, 10), '2026-01-08');

console.log('member-case rules OK');
