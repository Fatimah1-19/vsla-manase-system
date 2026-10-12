const assert = require('assert');
const {
  OFFICES, canOpen, canVote, quorumNeeded, tally, isFinished, closingTime,
} = require('../utils/officeVotes.js');

// ---- OFFICES ----
assert.deepStrictEqual(OFFICES, ['admin', 'treasurer', 'secretary']);

// ---- canOpen ----
assert.strictEqual(canOpen({ office: 'secretary', hasActiveHolder: false, candidateCount: 2 }).ok, true);
assert.strictEqual(canOpen({ office: 'secretary', hasActiveHolder: true, candidateCount: 2 }).ok, false,
  'cannot elect over an active holder');
assert.strictEqual(canOpen({ office: 'secretary', hasActiveHolder: false, hasOpenVote: true, candidateCount: 2 }).ok, false,
  'only one open election per office');
assert.strictEqual(canOpen({ office: 'secretary', hasActiveHolder: false, candidateCount: 1 }).ok, false,
  'need at least two candidates');
assert.strictEqual(canOpen({ office: 'nonsense', hasActiveHolder: false, candidateCount: 3 }).ok, false);

// ---- canVote ----
assert.strictEqual(canVote({ memberStatus: 'active' }).ok, true);
assert.strictEqual(canVote({ memberStatus: 'suspended' }).ok, false);
assert.strictEqual(canVote({ memberStatus: 'active', userActive: false }).ok, false);

// ---- quorumNeeded ----
assert.strictEqual(quorumNeeded(0, 50), 0);
assert.strictEqual(quorumNeeded(10, 50), 5);
assert.strictEqual(quorumNeeded(9, 50), 5);
assert.strictEqual(quorumNeeded(2, 50), 1);

// ---- tally ----
const base = { eligible: 10, quorumPercent: 50 };

// unique winner
const t1 = tally({ ...base, voted: 6, ballotsByCandidate: { 5: 4, 6: 2 } });
assert.strictEqual(t1.status, 'passed');
assert.strictEqual(t1.winnerUserId, 5);
assert.strictEqual(t1.top, 4);

// not enough turnout
const t2 = tally({ ...base, voted: 3, ballotsByCandidate: { 5: 2, 6: 1 } });
assert.strictEqual(t2.status, 'lapsed');
assert.strictEqual(t2.winnerUserId, null);

// a tie
const t3 = tally({ ...base, voted: 6, ballotsByCandidate: { 5: 3, 6: 3 } });
assert.strictEqual(t3.status, 'tie');
assert.deepStrictEqual(t3.tied.sort(), [5, 6]);

// nobody eligible
assert.strictEqual(tally({ eligible: 0, voted: 0 }).status, 'lapsed');
// no ballots for anyone
assert.strictEqual(tally({ ...base, voted: 5, ballotsByCandidate: {} }).status, 'lapsed');

// ---- isFinished ----
const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);
assert.strictEqual(isFinished({ eligible: 10, voted: 4, closesAt: future }), false);
assert.strictEqual(isFinished({ eligible: 10, voted: 10, closesAt: future }), true);
assert.strictEqual(isFinished({ eligible: 10, voted: 4, closesAt: past }), true);

// ---- closingTime ----
const start = new Date('2026-01-01T00:00:00Z');
assert.strictEqual(closingTime(2, start).toISOString().slice(0, 10), '2026-01-03');

console.log('office-vote rules OK');
